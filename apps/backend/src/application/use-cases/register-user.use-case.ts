import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { User, UserRole } from "@domain/entities/user.entity";
import { UserRepository } from "@domain/repositories/user.repository";
import { AuthorizationError, DuplicateResourceError } from "@application/errors";
import { validatePasswordStrength } from "@application/security/password-strength";

export class RegisterUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(
    email: string,
    name: string,
    password: string,
    requesterRole: UserRole | null = null,
  ): Promise<{ id: string }> {
    validatePasswordStrength(password);

    const existing = await this.userRepository.findByEmail(email);
    if (existing) throw new DuplicateResourceError("User exists");

    const hasManager = await this.userRepository.hasAnyManager();

    let role: UserRole;
    if (!hasManager) {
      role = "manager";
    } else {
      if (requesterRole !== "manager")
        throw new AuthorizationError("Only managers can register users");
      role = "field";
    }

    const hashed = await argon2.hash(password);
    const user = new User(randomUUID(), email, name, hashed, role);
    const result = await this.userRepository.save(user);
    return { id: result.id };
  }
}
