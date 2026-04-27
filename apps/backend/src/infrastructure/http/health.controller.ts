import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseDto } from "./dto/health.docs";

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
