import { and, desc, eq, isNull } from "drizzle-orm";
import { handle, requireUser } from "@/server/guard";
import { getDb, schema as s } from "@/db";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => {
  const u = await requireUser();
  const db = await getDb();
  return db.select().from(s.notifications).where(eq(s.notifications.userId, u.id)).orderBy(desc(s.notifications.createdAt)).limit(50);
});
export const POST = () => handle(async () => {
  const u = await requireUser();
  const db = await getDb();
  await db.update(s.notifications).set({ readAt: new Date() }).where(and(eq(s.notifications.userId, u.id), isNull(s.notifications.readAt)));
  return { ok: true };
});
