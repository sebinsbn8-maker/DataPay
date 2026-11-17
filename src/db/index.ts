import * as schema from "./schema";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * DATABASE_URL=postgres://...      -> real PostgreSQL (production, Render, Neon, etc.)
 * DATABASE_URL=pglite://./.pgdata  -> embedded Postgres (local demo & tests, no install needed)
 */
export type DB = NodePgDatabase<typeof schema>;

const g = globalThis as unknown as { __dpDb?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL ?? "pglite://./.pgdata";
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const dir = url.replace("pglite://", "");
    const client = new PGlite(dir === "memory" ? undefined : dir);
    return drizzle(client, { schema }) as unknown as DB;
  }
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 5) });
  return drizzle(pool, { schema });
}

export function getDb(): Promise<DB> {
  g.__dpDb ??= create();
  return g.__dpDb;
}

export async function runMigrations() {
  const url = process.env.DATABASE_URL ?? "pglite://./.pgdata";
  const db = await getDb();
  if (url.startsWith("pglite://")) {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: "./drizzle" });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
  }
}

export { schema };
