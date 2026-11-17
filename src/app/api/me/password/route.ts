import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { handle, requireUser, HttpError } from "@/server/guard";
import { getDb, schema as s } from "@/db";
import { audit } from "@/server/audit";

export const POST = (req: Request) => handle(async () => {
  const u = await requireUser();
  const b = z.object({ current: z.string(), next: z.string().min(10, "Password must be at least 10 characters") }).parse(await req.json());
  const db = await getDb();
  const [row] = await db.select().from(s.users).where(eq(s.users.id, u.id));
  if (!row?.passwordHash || !(await bcrypt.compare(b.current, row.passwordHash))) throw new HttpError(400, "Current password is incorrect");
  await db.update(s.users).set({ passwordHash: await bcrypt.hash(b.next, 12), updatedAt: new Date() }).where(eq(s.users.id, u.id));
  await audit(db, { userId: u.id, action: "UPDATE", entity: "user.password", entityId: u.id, note: "Changed own password" });
  return { ok: true };
});
