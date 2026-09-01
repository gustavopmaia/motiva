import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, Matches } from "class-validator";
import { OptionalString } from "../common/validation.decorators";

const REPORT_FORMATS = ["pdf", "csv"] as const;

export class MonthlyReportQueryDto {
  static readonly validationMessage = "Invalid report query.";

  @ApiProperty({
    description: "Month to report on, as YYYY-MM.",
    example: "2026-08",
  })
  @Matches(/^\d{4}-\d{2}$/, { message: "month must be in YYYY-MM format" })
  month!: string;

  @ApiPropertyOptional({
    description: "Optional road name filter.",
    example: "SP-021",
  })
  @OptionalString()
  roadName?: string;

  @ApiPropertyOptional({
    description: "Output format.",
    enum: REPORT_FORMATS,
    default: "pdf",
  })
  @IsOptional()
  @IsIn(REPORT_FORMATS, { message: "format must be pdf or csv" })
  format?: "pdf" | "csv";
}

export class AnnualReportQueryDto {
  static readonly validationMessage = "Invalid report query.";

  @ApiProperty({
    description: "Year to report on, as YYYY.",
    example: "2026",
  })
  @Matches(/^\d{4}$/, { message: "year must be in YYYY format" })
  year!: string;

  @ApiPropertyOptional({
    description: "Optional road name filter.",
    example: "SP-021",
  })
  @OptionalString()
  roadName?: string;

  @ApiPropertyOptional({
    description: "Output format.",
    enum: REPORT_FORMATS,
    default: "pdf",
  })
  @IsOptional()
  @IsIn(REPORT_FORMATS, { message: "format must be pdf or csv" })
  format?: "pdf" | "csv";
}

export class GeneratedReportResponseDto {
  @ApiProperty({ description: "Unique identifier of the generation record." })
  id!: string;

  @ApiProperty({
    description: "Which report was generated.",
    enum: ["artesp_monthly", "antt_annual"],
  })
  reportType!: string;

  @ApiProperty({ description: "Period covered, YYYY-MM or YYYY.", example: "2026-08" })
  period!: string;

  @ApiProperty({ description: "Output format used.", enum: ["pdf", "csv"] })
  format!: string;

  @ApiPropertyOptional({ description: "Road name filter used, if any.", nullable: true })
  roadName!: string | null;

  @ApiPropertyOptional({
    description: "Email of the user who generated the report.",
    nullable: true,
  })
  generatedByEmail!: string | null;

  @ApiProperty({ description: "When the report was generated." })
  generatedAt!: string;
}
