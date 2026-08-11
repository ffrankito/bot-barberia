import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pool } from "../lib/db.js";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await pool.query<{ name: string }>(
    `SELECT name FROM _migrations`
  );
  const appliedNames = new Set(applied.map((r) => r.name));

  for (const file of files) {
    if (appliedNames.has(file)) {
      console.log(`⏭️  ${file} (ya aplicada)`);
      continue;
    }

    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO _migrations (name) VALUES ($1)`, [file]);
      await client.query("COMMIT");
      console.log(`✅ ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`❌ Error aplicando ${file}:`, error);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log("🏁 Migraciones al día.");
  await pool.end();
}

main();
