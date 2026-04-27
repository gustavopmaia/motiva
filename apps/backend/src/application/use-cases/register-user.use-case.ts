import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { User, UserRole } from "@domain/entities/user.entity";
import { UserRepository } from "@domain/repositories/user.repository";
import { DuplicateResourceError } from "@application/errors";

export class RegisterUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(email: string, name: string, password: string, role: UserRole = "field") {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) throw new DuplicateResourceError("User exists");

    const hashed = await argon2.hash(password);
    const user = new User(randomUUID(), email, name, hashed, role);
    return this.userRepository.save(user);
  }
}
