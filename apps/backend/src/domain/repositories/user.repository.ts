import { User } from "@domain/entities/user.entity";

export const UserRepository = Symbol("UserRepository");

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<User>;
  update(user: User): Promise<User>;
}
