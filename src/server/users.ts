import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { HttpError } from "./guard";
import { ensureRoles } from "./bootstrap";
import { createResetToken } from "./passwordReset";

export async function listUsers() {
  const db = await getDb();
  return db.select({
    id: s.users.id, name: s.users.name, email: s.users.email, role: s.roles.name, isActive: s.users.isActive,
    contributorId: s.users.contributorId, lastLoginAt: s.users.lastLoginAt,
  }).from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).orderBy(s.users.name);
}

export async function createUser(actorId: string, i: { name: string; email: string; role: "ADMIN" | "MANAGER" | "CONTRIBUTOR"; password?: string; contributorId?: string | null; isActive: boolean }) {
  const db = await getDb();
  const roles = await ensureRoles();
  if (i.role === "CONTRIBUTOR" && !i.contributorId) throw new HttpError(400, "Link a contributor record to a contributor login");
  const [u] = await db.insert(s.users).values({
    name: i.name, email: i.email, roleId: roles[i.role], isActive: i.isActive,
    contributorId: i.role === "CONTRIBUTOR" ? i.contributorId : null,
    passwordHash: i.password ? await bcrypt.hash(i.password, 12) : null, // null => Google-only until a reset link is used
  }).returning({ id: s.users.id, email: s.users.email });
  await audit(db, { userId: actorId, action: "CREATE", entity: "user", entityId: u.id, after: { email: i.email, role: i.role } });
  return u;
}

export async function updateUser(actorId: string, id: string, i: Partial<{ name: string; role: "ADMIN" | "MANAGER" | "CONTRIBUTOR"; isActive: boolean; password: string; contributorId: string | null }>) {
  const db = await getDb();
  if (id === actorId && (i.isActive === false || (i.role && i.role !== "ADMIN"))) throw new HttpError(400, "You cannot deactivate or demote your own account");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (i.name) set.name = i.name;
  if (i.isActive !== undefined) set.isActive = i.isActive;
  if (i.contributorId !== undefined) set.contributorId = i.contributorId;
  if (i.role) set.roleId = (await ensureRoles())[i.role];
  if (i.password) { if (i.password.length < 10) throw new HttpError(400, "Password must be at least 10 characters"); set.passwordHash = await bcrypt.hash(i.password, 12); }
  await db.update(s.users).set(set as never).where(eq(s.users.id, id));
  await audit(db, { userId: actorId, action: "UPDATE", entity: "user", entityId: id, after: { ...i, password: i.password ? "[changed]" : undefined } });
  return { ok: true };
}

export async function resetLink(actorId: string, id: string) {
  const db = await getDb();
  const token = await createResetToken(id);
  await audit(db, { userId: actorId, action: "UPDATE", entity: "user.password", entityId: id, note: "Reset link issued by admin" });
  return { link: `${process.env.NEXTAUTH_URL ?? ""}/reset-password?token=${token}` };
}
