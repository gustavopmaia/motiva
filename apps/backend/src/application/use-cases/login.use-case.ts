import { Injectable, Inject } from "@nestjs/common";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { UserRepository } from "@domain/repositories/user.repository";
import { AuthenticationError } from "@application/errors";

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(UserRepository)
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(email: string, password: string): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findByEmail(email);
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
}
