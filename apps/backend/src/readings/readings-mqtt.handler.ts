import { DuplicateResourceError, NotFoundError } from "../common/errors";
import { DrizzleService } from "../database/drizzle.service";
import { InvalidReadingPayloadError } from "./reading-input.mapper";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, MqttClient } from "mqtt";
import { ReadingsService } from "./readings.service";
import { toIotReadingInput } from "./reading-input.mapper";

@Injectable()
export class ReadingsMqttHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReadingsMqttHandler.name);
  private client?: MqttClient;
  private subscribed = false;
  private pending?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly readingsService: ReadingsService,
    private readonly drizzle: DrizzleService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>("MQTT_URL");
    if (!url) return;
    const sharedTopic = `$share/${this.config.get<string>("MQTT_SHARED_GROUP") ?? "motiva"}/sensors/+/reading`;

    this.client = connect(url, {
      protocolVersion: 5,
      clientId: this.config.get<string>("MQTT_CLIENT_ID"),
      clean: !this.config.get<string>("MQTT_CLIENT_ID"),
      properties: { receiveMaximum: 1, sessionExpiryInterval: 86400, maximumPacketSize: 131072 },
      username: this.config.get<string>("MQTT_USERNAME"),
      password: this.config.get<string>("MQTT_PASSWORD"),
    });

    this.client.on("connect", () => {
      this.client?.subscribe(sharedTopic, { qos: 1 }, (error) => {
        if (error) {
          this.logger.error(`Failed to subscribe to ${sharedTopic}: ${error.message}`);
        } else this.subscribed = true;
      });
    });

    // MQTT.js sends PUBACK only after this callback succeeds (QoS 1).
    this.client.handleMessage = (packet, acknowledge) => {
      const pending = this.ingest(
        packet.topic,
        typeof packet.payload === "string" ? Buffer.from(packet.payload) : packet.payload,
      );
      this.pending = pending;
      void pending
        .then(
          () => acknowledge(),
          (error) => {
            this.logger.error(
              `MQTT persistence failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
            acknowledge(error instanceof Error ? error : new Error("Persistence failed"));
            // Reconnect with the same session so the broker can redeliver unacknowledged messages.
            this.client?.stream.destroy();
          },
        )
        .finally(() => {
          if (this.pending === pending) this.pending = undefined;
        });
    };

    this.client.on("error", (error) => {
      this.logger.error(`MQTT connection error: ${error.message}`);
    });
    this.client.on("close", () => {
      this.subscribed = false;
    });
  }

  isReady(): boolean {
    return !this.config.get<string>("MQTT_URL") || !!(this.client?.connected && this.subscribed);
  }

  async ingest(topic: string, payload: Buffer): Promise<void> {
    try {
      if (payload.length > 65536)
        throw new InvalidReadingPayloadError([
          { field: "body", message: "Payload exceeds 64 KiB" },
        ]);
      const body = JSON.parse(payload.toString()) as Record<string, unknown>;
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new InvalidReadingPayloadError([
          { field: "body", message: "Body must be an object" },
        ]);
      const [, nodeId] = topic.split("/");
      const input = toIotReadingInput(body, nodeId);
      if (input.originKey) input.originKey = `mqtt:${input.originKey}`;
      await this.readingsService.create(input);
    } catch (error) {
      if (
        !(error instanceof SyntaxError) &&
        !(error instanceof InvalidReadingPayloadError) &&
        !(error instanceof DuplicateResourceError) &&
        !(error instanceof NotFoundError)
      )
        throw error;
      // Poison messages are acknowledged only after durable quarantine.
      await this.drizzle.db
        .execute(sql`INSERT INTO ingestion_rejections (id, topic, payload, reason)
        VALUES (${randomUUID()}, ${topic}, ${payload.subarray(0, 65536).toString()}, ${error.message})`);
    }
  }

  async onModuleDestroy() {
    if (!this.client) return;
    this.client.stream.pause();
    if (this.pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.pending.catch(() => {}),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 10000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.client?.end(true);
        resolve();
      }, 10000);
      this.client?.end(false, {}, () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}
