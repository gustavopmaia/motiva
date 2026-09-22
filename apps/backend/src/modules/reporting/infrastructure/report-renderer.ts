import PDFDocument from "pdfkit";
import { Writable } from "stream";
import { ObjectStorage } from "../../../platform/storage/object-storage";
import { ReportContext, ReportRow } from "../domain/report-model";
const MARGIN = 40;
const ROW_HEIGHT = 46;
const HEADER_HEIGHT = 20;
const THUMB_SIZE = 36;
const STATUS_DOT_RADIUS = 3;

const COLUMNS = [
  { key: "roadName", label: "Rodovia", x: MARGIN, width: 55 },
  { key: "direction", label: "Pista", x: MARGIN + 55, width: 45 },
  { key: "km", label: "Km", x: MARGIN + 100, width: 80 },
  { key: "location", label: "Local", x: MARGIN + 180, width: 80 },
  { key: "team", label: "Equipe", x: MARGIN + 260, width: 85 },
  { key: "completedAt", label: "Concluido em", x: MARGIN + 345, width: 85 },
  { key: "status", label: "Evidencia", x: MARGIN + 430, width: 75 },
  { key: "photo", label: "Foto", x: MARGIN + 505, width: THUMB_SIZE + 10 },
] as const;

const STATUS_META: Record<string, { label: string; color: string }> = {
  verified: { label: "Confirmada", color: "#2e7d32" },
  suspicious: { label: "Suspeita", color: "#f9a825" },
  missing_exif: { label: "Sem metadados", color: "#757575" },
};
const NO_PHOTO_META = { label: "Sem foto", color: "#c62828" };

function statusMeta(status: string | null): { label: string; color: string } {
  if (!status) return NO_PHOTO_META;
  return STATUS_META[status] ?? { label: status, color: "#757575" };
}

const DIRECTION_LABELS: Record<string, string> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
  unica: "Unica",
};

const LOCATION_LABELS: Record<string, string> = {
  canteiro_central: "Canteiro central",
  faixa_1: "Faixa 1",
  faixa_2: "Faixa 2",
  lateral: "Lateral",
};

export const ARTESP_MONTHLY_CONTEXT = (month: string): ReportContext => ({
  title: "Relatorio Mensal de Conservacao Rodoviaria",
  subtitleLines: [
    "Programa: Conservacao Rodoviaria",
    "Subprograma b.1: Conservacao do Revestimento Vegetal",
    "Atividade: Rocagem",
  ],
  periodLabel: `Periodo de referencia: ${month}`,
});

export const ANTT_ANNUAL_CONTEXT = (year: string): ReportContext => ({
  title: "Relatorio Anual de Monitoracao — Faixa de Dominio",
  subtitleLines: ["Referencia: PER item 3.3.6 / 4.2.6 — conservacao do revestimento vegetal"],
  periodLabel: `Ano de referencia: ${year}`,
});

export class ReportRenderer {
  constructor(private readonly storage: ObjectStorage) {}
  renderCsv(rows: ReportRow[]): string {
    const header = [
      "Rodovia",
      "Pista",
      "Km Inicio",
      "Km Fim",
      "Local",
      "Equipe",
      "Concluido em",
      "Evidencia",
      "Hash da Foto",
    ];

    const lines = rows.map((row) =>
      [
        row.roadName,
        DIRECTION_LABELS[row.direction ?? ""] ?? "-",
        row.kmStart,
        row.kmEnd,
        LOCATION_LABELS[row.location ?? ""] ?? "-",
        row.team ?? "-",
        row.completedAt ? formatDate(row.completedAt) : "-",
        statusMeta(row.photoValidationStatus).label,
        row.photoHash ?? "-",
      ]
        .map(csvEscape)
        .join(","),
    );

    return [header.map(csvEscape).join(","), ...lines].join("\n");
  }

  async renderPdf(
    context: ReportContext,
    rows: ReportRow[],
    output?: Writable,
  ): Promise<PDFKit.PDFDocument> {
    const doc = new PDFDocument({
      margin: MARGIN,
      size: "A4",
      layout: "landscape",
      bufferPages: true,
    });
    if (output) {
      doc.on("error", (error) => output.destroy(error));
      output.once("close", () => doc.destroy());
      doc.pipe(output);
    }
    const generatedAt = new Date();

    doc.fontSize(14).text(context.title, { align: "center" });
    doc.fontSize(10);
    for (const line of context.subtitleLines) doc.text(line, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(11).text(context.periodLabel, { align: "left" });

    if (context.disclaimer) {
      doc.moveDown(0.3);
      doc
        .fontSize(8)
        .fillColor("#8a6d00")
        .text(context.disclaimer, { align: "left" })
        .fillColor("black");
    }
    doc.moveDown();

    if (rows.length === 0) {
      doc.fontSize(10).text("Nenhuma ordem de servico concluida no periodo.");
      this.drawFooters(doc, generatedAt);
      doc.end();
      return doc;
    }

    this.drawSummary(doc, rows);

    let headerY = doc.y;
    this.drawTableHeader(doc, headerY);
    let y = headerY + HEADER_HEIGHT;

    for (const row of rows) {
      if (doc.destroyed) return doc;
      if (y + ROW_HEIGHT > doc.page.height - MARGIN) {
        doc.addPage();
        headerY = MARGIN;
        this.drawTableHeader(doc, headerY);
        y = headerY + HEADER_HEIGHT;
      }
      await this.drawRow(doc, y, row);
      if (output) await waitForOutput(doc, output);
      y += ROW_HEIGHT;
    }

    this.drawFooters(doc, generatedAt);
    doc.end();
    return doc;
  }

  private drawSummary(doc: PDFKit.PDFDocument, rows: ReportRow[]): void {
    const counts = { verified: 0, suspicious: 0, missing_exif: 0, semFoto: 0 };
    for (const row of rows) {
      if (!row.photoValidationStatus) counts.semFoto += 1;
      else if (row.photoValidationStatus in counts) {
        (counts as Record<string, number>)[row.photoValidationStatus] += 1;
      }
    }

    doc
      .fontSize(9)
      .fillColor("#333333")
      .text(
        `Total de OS concluidas: ${rows.length}  |  Confirmadas: ${counts.verified}  |  ` +
          `Suspeitas: ${counts.suspicious}  |  Sem metadados: ${counts.missing_exif}  |  ` +
          `Sem foto: ${counts.semFoto}`,
      )
      .fillColor("black");
    doc.moveDown();
  }

  private drawFooters(doc: PDFKit.PDFDocument, generatedAt: Date): void {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      // texto do rodape fica dentro da margem inferior reservada pela pagina; sem zerar a
      // margem aqui, o pdfkit acha que o texto nao cabe e insere uma pagina em branco.
      const originalBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const footerY = doc.page.height - MARGIN + 12;
      doc
        .fontSize(7)
        .fillColor("#666666")
        .text(`Gerado em: ${formatDate(generatedAt)}`, MARGIN, footerY, {
          width: 250,
          align: "left",
          lineBreak: false,
        })
        .text(
          `Pagina ${i - range.start + 1} de ${range.count}`,
          doc.page.width - MARGIN - 150,
          footerY,
          {
            width: 150,
            align: "right",
            lineBreak: false,
          },
        )
        .fillColor("black");

      doc.page.margins.bottom = originalBottomMargin;
    }
  }

  private drawTableHeader(doc: PDFKit.PDFDocument, y: number): void {
    doc.fontSize(9).font("Helvetica-Bold");
    const textY = y + (HEADER_HEIGHT - doc.currentLineHeight()) / 2;
    for (const column of COLUMNS) {
      doc.text(column.label, column.x, textY, { width: column.width });
    }
    doc
      .moveTo(MARGIN, y + HEADER_HEIGHT)
      .lineTo(doc.page.width - MARGIN, y + HEADER_HEIGHT)
      .strokeColor("#999999")
      .stroke();
    doc.font("Helvetica").fillColor("black");
  }

  private async drawRow(doc: PDFKit.PDFDocument, y: number, row: ReportRow): Promise<void> {
    doc.fontSize(8);
    const textY = y + (ROW_HEIGHT - doc.currentLineHeight()) / 2;

    doc.text(row.roadName, COLUMNS[0].x, textY, { width: COLUMNS[0].width });
    doc.text(DIRECTION_LABELS[row.direction ?? ""] ?? "-", COLUMNS[1].x, textY, {
      width: COLUMNS[1].width,
    });
    doc.text(`${row.kmStart} - ${row.kmEnd}`, COLUMNS[2].x, textY, { width: COLUMNS[2].width });
    doc.text(LOCATION_LABELS[row.location ?? ""] ?? "-", COLUMNS[3].x, textY, {
      width: COLUMNS[3].width,
    });
    doc.text(row.team ?? "-", COLUMNS[4].x, textY, { width: COLUMNS[4].width });
    doc.text(row.completedAt ? formatDate(row.completedAt) : "-", COLUMNS[5].x, textY, {
      width: COLUMNS[5].width,
    });

    const meta = statusMeta(row.photoValidationStatus);
    const dotX = COLUMNS[6].x + STATUS_DOT_RADIUS;
    const dotY = textY + doc.currentLineHeight() / 2;
    doc.circle(dotX, dotY, STATUS_DOT_RADIUS).fill(meta.color).fillColor("black");
    doc.fontSize(8).text(meta.label, COLUMNS[6].x + STATUS_DOT_RADIUS * 2 + 6, textY, {
      width: COLUMNS[6].width - STATUS_DOT_RADIUS * 2 - 6,
    });

    await this.drawThumbnail(doc, COLUMNS[7].x, y + (ROW_HEIGHT - THUMB_SIZE) / 2, row.photoPath);

    doc
      .moveTo(MARGIN, y + ROW_HEIGHT)
      .lineTo(doc.page.width - MARGIN, y + ROW_HEIGHT)
      .strokeColor("#dddddd")
      .stroke();
  }

  private async drawThumbnail(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    photoPath: string | null,
  ): Promise<void> {
    if (photoPath) {
      try {
        const buffer = await this.storage.get("work-order-photos", photoPath);
        doc.image(buffer, x, y, {
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          fit: [THUMB_SIZE, THUMB_SIZE],
        });
        return;
      } catch {
        // arquivo nao encontrado em disco — cai no placeholder abaixo
      }
    }

    doc
      .rect(x, y, THUMB_SIZE, THUMB_SIZE)
      .fillAndStroke("#eeeeee", "#cccccc")
      .fillColor("#999999")
      .fontSize(6)
      .text("sem foto", x, y + THUMB_SIZE / 2 - 3, { width: THUMB_SIZE, align: "center" })
      .fillColor("black");
  }
}

async function waitForOutput(doc: PDFKit.PDFDocument, output: Writable): Promise<void> {
  if (!doc.isPaused() || doc.destroyed) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      doc.off("resume", finish);
      output.off("close", finish);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const timeout = setTimeout(() => {
      cleanup();
      const error = new Error("Report download stalled");
      doc.destroy(error);
      reject(error);
    }, 30000);
    doc.once("resume", finish);
    output.once("close", finish);
  });
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
