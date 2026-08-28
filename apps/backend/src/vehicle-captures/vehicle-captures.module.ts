import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { VehicleCapturesController } from "./vehicle-captures.controller";
import { VehicleCapturesService } from "./vehicle-captures.service";
import { VehicleCapturesProcessor } from "./vehicle-captures.processor";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { ReadingsModule } from "../readings/readings.module";
import { PHOTO_CLASSIFICATION_QUEUE } from "../common/queues";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ReadingsModule,
    BullModule.registerQueue({ name: PHOTO_CLASSIFICATION_QUEUE }),
  ],
  providers: [VehicleCapturesService, VehicleCapturesProcessor],
  controllers: [VehicleCapturesController],
})
export class VehicleCapturesModule {}
