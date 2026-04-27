import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CreateReadingUseCase } from "@application/use-cases/create-reading.use-case";
import { toCreateReadingInput } from "@infrastructure/readings/reading-input.mapper";
import { ApiKeyGuard } from "./guards/api-key.guard";

@Controller("readings")
@UseGuards(ApiKeyGuard)
export class ReadingsController {
  constructor(private readonly createReading: CreateReadingUseCase) {}

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    try {
      if (!body || typeof body !== "object") throw new Error("Invalid payload");

      return await this.createReading.execute(toCreateReadingInput(body));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Invalid payload";
      throw new BadRequestException(message);
    }
  }
}
