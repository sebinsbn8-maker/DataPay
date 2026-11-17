import { sql } from "drizzle-orm";
import type { DB } from "@/db";

/** Atomic auto-ID: PRJ-0001, CON-0001, PAY-2026-0001 */
export async function nextCode(db: Pick<DB, "execute">, key: string, prefix: string, pad = 4) {
  const r = await db.execute(sql`
    insert into counters (key, value) values (${key}, 1)
    on conflict (key) do update set value = counters.value + 1
    returning value`);
  const rows = ((r as unknown as { rows?: { value: number }[] }).rows ?? (r as unknown as { value: number }[]));
  return `${prefix}-${String(rows[0].value).padStart(pad, "0")}`;
}
