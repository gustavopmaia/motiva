import { PasswordResetToken } from "@domain/entities/password-reset-token.entity";

export const PasswordResetTokenRepository = Symbol("PasswordResetTokenRepository");

export interface PasswordResetTokenRepository {
  save(token: PasswordResetToken): Promise<PasswordResetToken>;
  findLatestActiveByUserId(userId: string): Promise<PasswordResetToken | null>;
  countRecentByUserId(userId: string, since: Date): Promise<number>;
  markUsed(id: string, usedAt: Date): Promise<void>;
}
