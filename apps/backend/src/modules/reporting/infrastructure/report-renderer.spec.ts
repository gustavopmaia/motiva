import { Writable } from "stream";
import { once } from "events";
import { jpeg } from "../../../test-photo";
import { ReportRow } from "../domain/report-model";
import { ReportRenderer, ARTESP_MONTHLY_CONTEXT } from "./report-renderer";

it("streams a valid PDF before all photos are loaded and respects a slow consumer", async () => {
  const rows: ReportRow[] = Array.from({ length: 12 }, (_, i) => ({
    roadName: "BR-101",
    direction: "norte",
    kmStart: String(i),
    kmEnd: String(i + 1),
    location: "lateral",
    team: "Equipe",
    completedAt: new Date(),
    photoPath: `${i}.jpg`,
    photoHash: "test-hash",
    photoValidationStatus: "missing_exif",
  }));
  let photosRead = 0,
    firstChunkAt = -1;
  const chunks: Buffer[] = [];
  const output = new Writable({
    highWaterMark: 64,
    write(chunk, _encoding, callback) {
      if (firstChunkAt === -1) firstChunkAt = photosRead;
      chunks.push(Buffer.from(chunk));
      setTimeout(callback, 1);
    },
  });
  const finished = once(output, "finish");
  const renderer = new ReportRenderer({
    get: async () => {
      photosRead++;
      await new Promise((resolve) => setImmediate(resolve));
      return jpeg;
    },
    put: async () => {},
    delete: async () => {},
  });
  await renderer.renderPdf(ARTESP_MONTHLY_CONTEXT("2026-09"), rows, output);
  await finished;
  const pdf = Buffer.concat(chunks).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(photosRead).toBe(rows.length);
  expect(firstChunkAt).toBeLessThan(rows.length);
}, 15000);
