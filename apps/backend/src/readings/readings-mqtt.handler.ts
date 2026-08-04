import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { connect, MqttClient } from "mqtt";
import { ReadingsService } from "./readings.service";
import { toIotReadingInput } from "./reading-input.mapper";

@Injectable()
export class ReadingsMqttHandler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReadingsMqttHandler.name);
  private client?: MqttClient;

  constructor(
    private readonly config: ConfigService,
    private readonly readingsService: ReadingsService,
  ) {}

  onModuleInit() {
    const url = this.config.get<string>("MQTT_URL");
    if (!url) return;

    this.client = connect(url, {
      username: this.config.get<string>("MQTT_USERNAME"),
      password: this.config.get<string>("MQTT_PASSWORD"),
    });

    this.client.on("connect", () => {
      this.client?.subscribe("sensors/+/reading", (error) => {
        if (error) {
          this.logger.error(`Failed to subscribe to sensors/+/reading: ${error.message}`);
        }
      });
    });

    this.client.on("message", (topic, payload) => {
      void (async () => {
        const [, nodeId] = topic.split("/");

        try {
          const body = JSON.parse(payload.toString()) as Record<string, unknown>;
          await this.readingsService.create(toIotReadingInput(body, nodeId));
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Invalid MQTT payload";
          this.logger.error(`Failed to ingest MQTT reading on ${topic}: ${message}`);
        }
      })();
    });

    this.client.on("error", (error) => {
      this.logger.error(`MQTT connection error: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    if (!this.client) return;

    await new Promise<void>((resolve) => {
      this.client?.end(false, {}, () => resolve());
    });
  }
}
