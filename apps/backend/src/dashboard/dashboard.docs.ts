import { ApiProperty } from "@nestjs/swagger";

export class SegmentsSummaryDto {
  @ApiProperty({ description: "Total de trechos cadastrados." })
  total!: number;

  @ApiProperty({ description: "Score medio de vegetacao da malha (0-100).", nullable: true })
  averageScore!: number | null;

  @ApiProperty({ description: "Trechos com score critico (>= 75)." })
  criticalCount!: number;
}

export class PhotoEvidenceSummaryDto {
  @ApiProperty({ description: "Dias considerados na janela (30)." })
  periodDays!: number;

  @ApiProperty({ description: "Fotos com EXIF confirmado." })
  verified!: number;

  @ApiProperty({ description: "Fotos com EXIF divergente." })
  suspicious!: number;

  @ApiProperty({ description: "Fotos sem metadados de EXIF." })
  missingExif!: number;
}

export class WorkOrdersSummaryDto {
  @ApiProperty({ description: "OS em aberto (open + in_progress)." })
  open!: number;

  @ApiProperty({ description: "OS concluidas." })
  completed!: number;

  @ApiProperty({ description: "OS em aberto com prioridade critica." })
  critical!: number;

  @ApiProperty({ description: "OS em aberto com prioridade urgente." })
  urgent!: number;

  @ApiProperty({ description: "OS em aberto com prioridade atencao." })
  attention!: number;

  @ApiProperty({
    description: "OS em aberto que estouraram o prazo da propria prioridade (ver dispatch).",
  })
  overdue!: number;
}

export class ReportsSummaryDto {
  @ApiProperty({ description: "Total de relatorios ja gerados." })
  totalGenerated!: number;

  @ApiProperty({ description: "Data do ultimo relatorio gerado.", nullable: true })
  lastGeneratedAt!: string | null;
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: SegmentsSummaryDto })
  segments!: SegmentsSummaryDto;

  @ApiProperty({ type: PhotoEvidenceSummaryDto })
  photoEvidence!: PhotoEvidenceSummaryDto;

  @ApiProperty({ type: WorkOrdersSummaryDto })
  workOrders!: WorkOrdersSummaryDto;

  @ApiProperty({ type: ReportsSummaryDto })
  reports!: ReportsSummaryDto;
}
