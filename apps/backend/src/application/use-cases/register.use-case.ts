import { Injectable } from "@nestjs/common";
import { IUserRepository } from "@domain/repositories/user.repository";
import { User } from "@domain/entities/user.entity";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";

@Injectable()
export class RegisterUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(email: string, name: string, password: string) {
    const existing = await this.userRepository.findByEmail(email);
    if (existing) throw new Error("User exists");

    const hashed = await argon2.hash(password);
    const user = new User(randomUUID(), email, name, hashed);
    return this.userRepository.save(user);
  }
}
