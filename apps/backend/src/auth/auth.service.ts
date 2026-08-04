import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { ApiKey, ApiKeySource } from "./api-key.entity";
import { User, UserRole } from "./user.entity";
import {
  AuthenticationError,
  AuthorizationError,
  DuplicateResourceError,
  InvalidOperationError,
  TooManyRequestsError,
} from "../common/errors";
import { validatePasswordStrength } from "./password-strength";
import { DrizzleService } from "../database/drizzle.service";
import { apiKeys, passwordResetTokens, users } from "../database/schema";

const RESET_CODE = "112233";
const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly drizzle: DrizzleService,
    private readonly jwtService: JwtService,
  ) {}

  async register(
    email: string,
    name: string,
    password: string,
    requesterRole: UserRole | null = null,
    targetRole: UserRole = "field",
  ): Promise<{ id: string }> {
    if (requesterRole !== "manager") {
      throw new AuthorizationError("Only managers can register users");
    }

    validatePasswordStrength(password);

    const existing = await this.findUserByEmail(email);
    if (existing) throw new DuplicateResourceError("Email is already registered.");

    const hashed = await argon2.hash(password);
    const [saved] = await this.drizzle.db
      .insert(users)
      .values({
        id: randomUUID(),
        email,
        name,
        password: hashed,
        role: targetRole,
      })
      .returning({ id: users.id });

    return { id: saved.id };
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.findUserByEmail(email);
    if (!user) throw new AuthenticationError("Invalid credentials");

    const valid = await argon2.verify(user.password, password);
    if (!valid) throw new AuthenticationError("Invalid credentials");

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken };
  }

  async getUserProfile(id: string): Promise<User | null> {
    const [row] = await this.drizzle.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (!user) return;

    const since = new Date(Date.now() - RESET_WINDOW_MS);
    const [recent] = await this.drizzle.db
      .select({ value: count() })
      .from(passwordResetTokens)
      .where(
        and(eq(passwordResetTokens.userId, user.id), gte(passwordResetTokens.createdAt, since)),
      );

    if (Number(recent?.value ?? 0) >= MAX_ATTEMPTS) {
      throw new TooManyRequestsError("Too many reset attempts, try again later");
    }

    await this.drizzle.db.insert(passwordResetTokens).values({
      id: randomUUID(),
      userId: user.id,
      codeHash: createHash("sha256").update(RESET_CODE).digest("hex"),
      expiresAt: new Date(Date.now() + RESET_WINDOW_MS),
      usedAt: null,
      createdAt: new Date(),
    });

    this.logger.log(`[PasswordReset] code ${RESET_CODE} for ${email}`);
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    validatePasswordStrength(newPassword);

    const user = await this.findUserByEmail(email);
    if (!user) throw new InvalidOperationError("Invalid or expired code");

    const [token] = await this.drizzle.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    if (!token) throw new InvalidOperationError("Invalid or expired code");

    const codeHash = createHash("sha256").update(code).digest("hex");
    const expected = Buffer.from(token.codeHash, "hex");
    const actual = Buffer.from(codeHash, "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new InvalidOperationError("Invalid or expired code");
    }

    const hashed = await argon2.hash(newPassword);
    await this.drizzle.db.transaction(async (tx) => {
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));
      await tx
        .update(users)
        .set({ password: hashed, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    });
  }

  async createApiKey(
    name: string,
    source: ApiKeySource,
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const rawKey = randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const [saved] = await this.drizzle.db
      .insert(apiKeys)
      .values({ id: randomUUID(), name, source, key: keyHash, createdAt: new Date() })
      .returning();

    return { apiKey: toApiKey(saved), rawKey };
  }

  async verifyApiKey(rawKey: string): Promise<ApiKey | null> {
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const [row] = await this.drizzle.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, keyHash))
      .limit(1);

    return row ? toApiKey(row) : null;
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    const [row] = await this.drizzle.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toUser(row) : null;
  }
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    password: row.password,
    role: row.role as UserRole,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toApiKey(row: typeof apiKeys.$inferSelect): ApiKey {
  return {
    id: row.id,
    name: row.name,
    source: row.source as ApiKeySource,
    key: row.key,
    createdAt: row.createdAt,
  };
}
