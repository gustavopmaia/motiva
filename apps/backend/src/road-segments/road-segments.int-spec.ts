import { DrizzleService } from "../database/drizzle.service";
import { RoadSegmentsService } from "./road-segments.service";
import {
  createTestDrizzle,
  describeDb,
  insertSegment,
  migrateTestDb,
  truncateAll,
} from "../test-db";

const SEGMENT = "cccccccc-0000-4000-8000-00000000020a";
const LAT = -23.4162;
const LON = -46.7841;

describeDb("road segments against a real database", () => {
  let drizzle: DrizzleService;
  let service: RoadSegmentsService;

  beforeAll(async () => {
    drizzle = createTestDrizzle();
    await migrateTestDb(drizzle);
  }, 60_000);

  afterAll(async () => {
    await drizzle.onModuleDestroy();
  });

  beforeEach(async () => {
    await truncateAll(drizzle);
    service = new RoadSegmentsService(drizzle);
    await insertSegment(drizzle, {
      id: SEGMENT,
      roadName: "BR-101",
      kmStart: 10,
      kmEnd: 11,
      lat: LAT,
      lon: LON,
    });
  });

  it("devolve a geometria como GeoJSON LineString", async () => {
    const [segment] = await service.findAll();

    expect(segment.geometry.type).toBe("LineString");
    expect(segment.geometry.coordinates.length).toBeGreaterThan(1);
  });

  it("usa a ordem [longitude, latitude] que o GeoJSON exige", async () => {
    const [segment] = await service.findAll();
    const [lon, lat] = segment.geometry.coordinates[0];

    // Valores distintos entre si: uma troca de lat com lon quebra o teste.
    expect(lon).toBeCloseTo(LON, 4);
    expect(lat).toBeCloseTo(LAT, 4);
  });
});
