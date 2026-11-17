import { desc, eq } from "drizzle-orm";
import { handle, requirePermission } from "@/server/guard";
import { getDb, schema as s } from "@/db";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  await requirePermission("settings:write");
  const q = qs(req);
  const db = await getDb();
  return db.select({ id: s.auditLogs.id, at: s.auditLogs.createdAt, action: s.auditLogs.action, entity: s.auditLogs.entity, entityId: s.auditLogs.entityId, before: s.auditLogs.before, after: s.auditLogs.after, note: s.auditLogs.note, user: s.users.name })
    .from(s.auditLogs).leftJoin(s.users, eq(s.users.id, s.auditLogs.userId)).orderBy(desc(s.auditLogs.createdAt)).limit(Math.min(Number(q.limit) || 100, 500));
});
