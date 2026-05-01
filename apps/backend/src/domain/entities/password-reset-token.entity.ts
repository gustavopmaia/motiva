export class PasswordResetToken {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly codeHash: string,
    public readonly expiresAt: Date,
    public readonly usedAt: Date | null,
    public readonly createdAt: Date,
  ) {}
}
