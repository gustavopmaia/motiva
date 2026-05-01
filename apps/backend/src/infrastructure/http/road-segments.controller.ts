import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@infrastructure/http/guards/jwt.guard";
import { RoadSegmentRepository } from "@domain/repositories/road-segment.repository";
import { RoadSegmentResponseDto } from "./dto/road-segments.docs";

@ApiTags("Road Segments")
@Controller("road-segments")
export class RoadSegmentsController {
  constructor(
    @Inject(RoadSegmentRepository)
    private readonly roadSegmentRepository: RoadSegmentRepository,
  ) {}

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
    const segments = await this.roadSegmentRepository.findAll();
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
