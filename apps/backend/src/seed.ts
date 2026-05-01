import postgres from "postgres";
import * as argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "crypto";

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  const sql = postgres(databaseUrl);

  try {
    console.log("Seeding database...");

    const managerId = randomUUID();
    const passwordHash = await argon2.hash("Pass123123@");
    await sql`
      INSERT INTO users (id, email, name, password, role)
      VALUES (${managerId}, 'manager@motiva.app', 'Operations Manager', ${passwordHash}, 'manager')
      ON CONFLICT (email) DO NOTHING
    `;
    console.log("Manager user: manager@motiva.app / Pass123213@");

    const sources = ["iot", "vehicle", "satellite"] as const;
    for (const source of sources) {
      const id = randomUUID();
      const rawKey = randomBytes(32).toString("hex");
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      await sql`
        INSERT INTO api_keys (id, name, source, key)
        VALUES (${id}, ${source + "-key"}, ${source}, ${keyHash})
        ON CONFLICT DO NOTHING
      `;
      console.log(`API key [${source}]: ${rawKey}`);
    }

    console.log("Seed complete!");
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
