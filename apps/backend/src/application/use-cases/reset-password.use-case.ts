import { Injectable, Inject } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import * as argon2 from "argon2";
import { UserRepository } from "@domain/repositories/user.repository";
import { PasswordResetTokenRepository } from "@domain/repositories/password-reset-token.repository";
import { User } from "@domain/entities/user.entity";
import { InvalidOperationError } from "@application/errors";
import { validatePasswordStrength } from "@application/security/password-strength";

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(PasswordResetTokenRepository)
    private readonly tokenRepository: PasswordResetTokenRepository,
  ) {}

  async execute(email: string, code: string, newPassword: string): Promise<void> {
    validatePasswordStrength(newPassword);

    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new InvalidOperationError("Invalid or expired code");

    const token = await this.tokenRepository.findLatestActiveByUserId(user.id);
    if (!token) throw new InvalidOperationError("Invalid or expired code");

    const codeHash = createHash("sha256").update(code).digest("hex");
    const expected = Buffer.from(token.codeHash, "hex");
    const actual = Buffer.from(codeHash, "hex");

    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new InvalidOperationError("Invalid or expired code");
    }

    await this.tokenRepository.markUsed(token.id, new Date());

    const hashed = await argon2.hash(newPassword);
    const updated = new User(
      user.id,
      user.email,
      user.name,
      hashed,
      user.role,
      user.createdAt,
      new Date(),
    );
    await this.userRepository.update(updated);
  }
}
