import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { UserRepository } from "@domain/repositories/user.repository";
import { User, UserRole } from "@domain/entities/user.entity";
import { DrizzleService } from "../drizzle.service";
import { users } from "../schema";

@Injectable()
export class UserDrizzleRepository implements UserRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findById(id: string): Promise<User | null> {
    const [row] = await this.drizzle.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) return null;
    return this.toEntity(row);
  }

  async findByEmail(email: string): Promise<User | null> {
    const [row] = await this.drizzle.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row) return null;
    return this.toEntity(row);
  }

  async hasAnyManager(): Promise<boolean> {
    const [row] = await this.drizzle.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "manager"))
      .limit(1);
    return !!row;
  }

  async save(user: User): Promise<User> {
    const [saved] = await this.drizzle.db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        name: user.name,
        password: user.password,
        role: user.role,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { name: user.name, password: user.password, role: user.role },
      })
      .returning();
    return this.toEntity(saved);
  }

  async update(user: User): Promise<User> {
    const [saved] = await this.drizzle.db
      .update(users)
      .set({ name: user.name, password: user.password, role: user.role, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    return this.toEntity(saved);
  }

  private toEntity(row: typeof users.$inferSelect): User {
    return new User(
      row.id,
      row.email,
      row.name,
      row.password,
      row.role as UserRole,
      row.createdAt,
      row.updatedAt,
    );
  }
}
