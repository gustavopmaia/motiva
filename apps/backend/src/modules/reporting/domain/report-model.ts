export type ReportRow = {
  roadName: string;
  direction: string | null;
  kmStart: string;
  kmEnd: string;
  location: string | null;
  team: string | null;
  completedAt: Date | null;
  photoPath: string | null;
  photoHash: string | null;
  photoValidationStatus: string | null;
};

export type ReportContext = {
  title: string;
  subtitleLines: string[];
  periodLabel: string;
  disclaimer?: string;
};

export type GeneratedReportType = "artesp_monthly" | "antt_annual";
export type ReportFormat = "pdf" | "csv";

export type RecordGenerationInput = {
  reportType: GeneratedReportType;
  period: string;
  format: ReportFormat;
  roadName: string | null;
  userId: string;
};

export type GeneratedReport = {
  id: string;
  reportType: string;
  period: string;
  format: string;
  roadName: string | null;
  generatedByEmail: string | null;
  generatedAt: Date;
};
