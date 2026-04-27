import { ApiProperty } from "@nestjs/swagger";

export class HealthResponseDto {
  @ApiProperty({
    description: "Current health status for the backend process.",
    example: "ok",
  })
  status!: string;
}
