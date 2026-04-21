import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { IUserRepository } from "@domain/repositories/user.repository";
import { User } from "@domain/entities/user.entity";
import { DrizzleService } from "../drizzle.service";
import { users } from "../schema";

@Injectable()
export class DrizzleUserRepository implements IUserRepository {
  constructor(private drizzle: DrizzleService) {}

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return null;
    return new User(user.id, user.email, user.name, user.password);
  }

  async save(user: User): Promise<User> {
    const [saved] = await this.drizzle.db
      .insert(users)
      .values({
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: user.name,
          password: user.password,
        },
      })
      .returning();

    return new User(saved.id, saved.name, saved.email, saved.password);
  }
}
