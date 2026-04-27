import { Controller, Get, UseGuards } from "@nestjs/common";
import { AlertRepository } from "@domain/repositories/alert.repository";
import { JwtAuthGuard } from "./guards/jwt.guard";

@Controller("alerts")
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertRepository: AlertRepository) {}

  @Get()
  async findAll() {
    return this.alertRepository.findAll();
  }
}
