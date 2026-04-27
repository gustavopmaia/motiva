import * as argon2 from "argon2";
import { UserRepository } from "@domain/repositories/user.repository";
import { AuthenticationError } from "@application/errors";
import { signJwt } from "@application/security/jwt";

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtSecret: string,
  ) {}

  async execute(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) throw new AuthenticationError("Invalid credentials");

    const valid = await argon2.verify(user.password, password);
    if (!valid) throw new AuthenticationError("Invalid credentials");

    const accessToken = signJwt(
      { sub: user.id, email: user.email, role: user.role },
      this.jwtSecret,
    );
    return { accessToken };
  }
}
