import { Module } from "@nestjs/common";
import { DrizzleService } from "@infrastructure/database/drizzle.service";

@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DatabaseModule {}
