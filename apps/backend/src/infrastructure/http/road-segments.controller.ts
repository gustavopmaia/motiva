import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RoadSegmentsService } from "@application/services/road-segments.service";
import { RoadSegmentResponseDto } from "./dto/road-segments.docs";

@ApiTags("Road Segments")
@Controller("road-segments")
export class RoadSegmentsController {
  constructor(private readonly roadSegmentsService: RoadSegmentsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("jwt")
  @ApiOperation({
    summary: "List all road segments",
    description: "Returns every road segment with its current fused vegetation score.",
  })
  @ApiOkResponse({ type: [RoadSegmentResponseDto], description: "Array of road segments." })
  @ApiUnauthorizedResponse({ description: "JWT token missing or invalid." })
  async findAll() {
    const segments = await this.roadSegmentsService.findAll();
    return segments.map((s) => ({
      id: s.id,
      roadName: s.roadName,
      kmStart: s.kmStart,
      kmEnd: s.kmEnd,
      mowingType: s.mowingType,
      scoreCurrent: s.scoreCurrent,
      scoreDivergent: s.scoreDivergent,
    }));
  }
}
