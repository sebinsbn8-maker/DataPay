import { schema, type DB } from "@/db";

type Tx = Pick<DB, "insert">;

export async function audit(
  db: Tx,
  entry: {
    userId?: string | null;
    action: "CREATE" | "UPDATE" | "DELETE" | "ARCHIVE" | "APPROVE" | "PAYMENT" | "ADJUST" | "RATE_CHANGE" | "QC_CHANGE" | "LOGIN" | "ALLOCATE";
    entity: string;
    entityId?: string | null;
    before?: unknown;
    after?: unknown;
    note?: string;
  },
) {
  await db.insert(schema.auditLogs).values({
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    note: entry.note,
  });
}
