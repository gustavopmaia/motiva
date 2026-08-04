import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";

class HealthResponseDto {
  @ApiProperty({
    description: "Current health status for the backend process.",
    example: "ok",
  })
  status!: string;
}

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOperation({
    summary: "Check backend health",
    description: "Returns a lightweight status response for load balancers and uptime checks.",
  })
  @ApiOkResponse({
    type: HealthResponseDto,
    description: "Backend process is accepting requests.",
  })
  check() {
    return { status: "ok" };
  }
}
