import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, gt, gte, isNull } from "drizzle-orm";
import { PasswordResetTokenRepository } from "@domain/repositories/password-reset-token.repository";
import { PasswordResetToken } from "@domain/entities/password-reset-token.entity";
import { DrizzleService } from "../drizzle.service";
import { passwordResetTokens } from "../schema";

@Injectable()
export class PasswordResetTokenDrizzleRepository implements PasswordResetTokenRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async save(token: PasswordResetToken): Promise<PasswordResetToken> {
    const [saved] = await this.drizzle.db
      .insert(passwordResetTokens)
      .values({
        id: token.id,
        userId: token.userId,
        codeHash: token.codeHash,
        expiresAt: token.expiresAt,
        usedAt: token.usedAt,
        createdAt: token.createdAt,
      })
      .returning();
    return this.toEntity(saved);
  }

  async findLatestActiveByUserId(userId: string): Promise<PasswordResetToken | null> {
    const [row] = await this.drizzle.db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    if (!row) return null;
    return this.toEntity(row);
  }

  async countRecentByUserId(userId: string, since: Date): Promise<number> {
    const [result] = await this.drizzle.db
      .select({ value: count() })
      .from(passwordResetTokens)
      .where(
        and(eq(passwordResetTokens.userId, userId), gte(passwordResetTokens.createdAt, since)),
      );
    return Number(result?.value ?? 0);
  }

  async markUsed(id: string, usedAt: Date): Promise<void> {
    await this.drizzle.db
      .update(passwordResetTokens)
      .set({ usedAt })
      .where(eq(passwordResetTokens.id, id));
  }

  private toEntity(row: typeof passwordResetTokens.$inferSelect): PasswordResetToken {
    return new PasswordResetToken(
      row.id,
      row.userId,
      row.codeHash,
      row.expiresAt,
      row.usedAt,
      row.createdAt,
    );
  }
}
