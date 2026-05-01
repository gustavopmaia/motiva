import { Injectable, Inject, Logger } from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import { UserRepository } from "@domain/repositories/user.repository";
import { PasswordResetTokenRepository } from "@domain/repositories/password-reset-token.repository";
import { PasswordResetToken } from "@domain/entities/password-reset-token.entity";
import { TooManyRequestsError } from "@application/errors";

const RESET_CODE = "112233";
const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    @Inject(PasswordResetTokenRepository)
    private readonly tokenRepository: PasswordResetTokenRepository,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;

    const since = new Date(Date.now() - RESET_WINDOW_MS);
    const count = await this.tokenRepository.countRecentByUserId(user.id, since);
    if (count >= MAX_ATTEMPTS)
      throw new TooManyRequestsError("Too many reset attempts, try again later");

    const codeHash = createHash("sha256").update(RESET_CODE).digest("hex");
    const expiresAt = new Date(Date.now() + RESET_WINDOW_MS);
    const token = new PasswordResetToken(
      randomUUID(),
      user.id,
      codeHash,
      expiresAt,
      null,
      new Date(),
    );

    await this.tokenRepository.save(token);
    this.logger.log(`[PasswordReset] code ${RESET_CODE} for ${email}`);
  }
}
