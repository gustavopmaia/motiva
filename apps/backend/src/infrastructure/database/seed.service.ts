import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRepository } from "@domain/repositories/user.repository";
import { ApiKeyRepository } from "@domain/repositories/api-key.repository";
import { ApiKeySource } from "@domain/entities/api-key.entity";
import { RegisterUserUseCase } from "@application/use-cases/register-user.use-case";
import { CreateApiKeyUseCase } from "@application/use-cases/create-api-key.use-case";

const API_KEY_SOURCES: ApiKeySource[] = ["iot", "vehicle", "satellite"];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userRepository: UserRepository,
    private readonly apiKeyRepository: ApiKeyRepository,
    private readonly registerUser: RegisterUserUseCase,
    private readonly createApiKey: CreateApiKeyUseCase,
  ) {}

  async onApplicationBootstrap() {
    await this.seedManagerUser();
    await this.seedApiKeys();
  }

  private async seedManagerUser() {
    const email = this.config.get<string>("SEED_MANAGER_EMAIL") ?? "admin@motiva.app";
    const existing = await this.userRepository.findByEmail(email);
    if (existing) return;

    const password = this.config.get<string>("SEED_MANAGER_PASSWORD") ?? randomPassword();
    await this.registerUser.execute(email, "Admin", password, "manager");

    this.logger.log(`Seeded manager user ${email} with password ${password}`);
  }

  private async seedApiKeys() {
    for (const source of API_KEY_SOURCES) {
      const existing = await this.apiKeyRepository.findBySource(source);
      if (existing) continue;

      const { rawKey } = await this.createApiKey.execute(`${source}-default`, source);

      this.logger.log(`Seeded ${source} API key: ${rawKey}`);
    }
  }
}

function randomPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
