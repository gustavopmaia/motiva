import { ApiProperty } from "@nestjs/swagger";

export class TeamBaseResponseDto {
  @ApiProperty({ description: "Unique team identifier." })
  id!: string;

  @ApiProperty({ description: "Team name.", example: "Equipe Norte" })
  name!: string;

  @ApiProperty({ description: "Latitude of the team's home base.", example: -23.5505 })
  baseLat!: number;

  @ApiProperty({ description: "Longitude of the team's home base.", example: -46.6333 })
  baseLng!: number;

  @ApiProperty({ description: "Road the team is responsible for.", example: "SP-021 Norte" })
  roadName!: string;
}
