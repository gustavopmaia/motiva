import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VehicleCapturesController } from "./vehicle-captures.controller";
import { VehicleCapturesService } from "./vehicle-captures.service";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { PHOTO_CLASSIFICATION_QUEUE } from "../common/queues";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    BullModule.registerQueue({ name: PHOTO_CLASSIFICATION_QUEUE }),
  ],
  providers: [VehicleCapturesService],
  controllers: [VehicleCapturesController],
})
export class VehicleCapturesModule {}
