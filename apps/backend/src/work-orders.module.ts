import { Module } from "@nestjs/common";
import { WorkOrdersListener } from "@application/listeners/work-orders.listener";
import { CreateWorkOrderUseCase } from "@application/use-cases/create-work-order.use-case";
import { UpdateWorkOrderUseCase } from "@application/use-cases/update-work-order.use-case";
import { CompleteWorkOrderUseCase } from "@application/use-cases/complete-work-order.use-case";
import { WorkOrderRepository } from "@domain/repositories/work-order.repository";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { WorkOrderDrizzleRepository } from "@infrastructure/database/repositories/work-order.drizzle.repository";
import { WorkOrdersController } from "@infrastructure/http/work-orders.controller";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { RoadSegmentsModule } from "./road-segments.module";

@Module({
  imports: [DatabaseModule, AuthModule, RoadSegmentsModule],
  providers: [
    WorkOrdersListener,
    { provide: WorkOrderRepository, useClass: WorkOrderDrizzleRepository },
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
