import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createResetToken(userId: string) {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("hex");
  await db.update(schema.users)
    .set({ resetToken: sha(token), resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) })
    .where(eq(schema.users.id, userId));
  return token;
}

export async function consumeResetToken(token: string, newPassword: string) {
  if (newPassword.length < 10) throw new Error("Password must be at least 10 characters");
  const db = await getDb();
  const [u] = await db.select().from(schema.users)
    .where(and(eq(schema.users.resetToken, sha(token)), gt(schema.users.resetTokenExpiresAt, new Date())));
  if (!u) throw new Error("This reset link is invalid or has expired");
  await db.update(schema.users)
    .set({ passwordHash: await bcrypt.hash(newPassword, 12), resetToken: null, resetTokenExpiresAt: null })
    .where(eq(schema.users.id, u.id));
  await audit(db, { userId: u.id, action: "UPDATE", entity: "user.password", entityId: u.id, note: "Password reset via token" });
}
