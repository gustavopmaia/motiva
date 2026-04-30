import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { WorkOrdersProcessor } from "@application/processors/work-orders.processor";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { UpdateWorkOrderUseCase } from "@application/use-cases/update-work-order.use-case";
import { CompleteWorkOrderUseCase } from "@application/use-cases/complete-work-order.use-case";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { WorkOrderDrizzleRepository } from "@infrastructure/database/repositories/work-order.drizzle.repository";
import { RoadSegmentDrizzleRepository } from "@infrastructure/database/repositories/road-segment.drizzle.repository";
import { WorkOrdersController } from "@infrastructure/http/work-orders.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { ALERTS_QUEUE } from "@application/jobs/readings-queue.types";

@Module({
  imports: [DatabaseModule, AuthModule, BullModule.registerQueue({ name: ALERTS_QUEUE })],
  providers: [
    WorkOrdersProcessor,
    { provide: WorkOrderRepository, useClass: WorkOrderDrizzleRepository },
    { provide: RoadSegmentRepository, useClass: RoadSegmentDrizzleRepository },
    {
      provide: CreateWorkOrderUseCase,
      useFactory: (workOrderRepository: WorkOrderRepository) =>
        new CreateWorkOrderUseCase(workOrderRepository),
      inject: [WorkOrderRepository],
    },
    {
      provide: UpdateWorkOrderUseCase,
      useFactory: (workOrderRepository: WorkOrderRepository) =>
        new UpdateWorkOrderUseCase(workOrderRepository),
      inject: [WorkOrderRepository],
    },
    {
      provide: CompleteWorkOrderUseCase,
      useFactory: (
        workOrderRepository: WorkOrderRepository,
        roadSegmentRepository: RoadSegmentRepository,
      ) => new CompleteWorkOrderUseCase(workOrderRepository, roadSegmentRepository),
      inject: [WorkOrderRepository, RoadSegmentRepository],
    },
  ],
  controllers: [WorkOrdersController],
})
export class WorkOrdersModule {}
