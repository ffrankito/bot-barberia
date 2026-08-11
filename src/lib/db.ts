import pg from "pg";

const { Pool, types } = pg;

// El resto del código trata las fechas como strings ISO (así las devolvía Supabase).
// pg por defecto las parsea a objetos Date — desactivamos eso para timestamp/timestamptz/date
// y devolvemos el string tal cual, pero normalizado a ISO-8601 válido:
// - espacio -> "T"
// - Postgres devuelve el offset de timezone sin minutos cuando es entero ("+00", "-03"),
//   lo cual `new Date(...)` de V8 no parsea (da "Invalid Date"). Le agregamos ":00".
const TIMESTAMPTZ_OID = 1184;
const TIMESTAMP_OID = 1114;
const DATE_OID = 1082;
function toIsoString(val: string): string {
  return val.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}
for (const oid of [TIMESTAMPTZ_OID, TIMESTAMP_OID, DATE_OID]) {
  types.setTypeParser(oid, toIsoString);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Sin este handler, un error en un cliente idle tira todo el proceso abajo.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
