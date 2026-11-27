import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
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

type Patch = Partial<{ name: string; email: string; role: "ADMIN" | "MANAGER" | "CONTRIBUTOR"; isActive: boolean; password: string; contributorId: string | null }>;

async function otherActiveAdmins(id: string) {
  const db = await getDb();
  const rows = await db.select({ id: s.users.id }).from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId))
    .where(and(eq(s.roles.name, "ADMIN"), eq(s.users.isActive, true), ne(s.users.id, id)));
  return rows.length;
}

export async function updateUser(actorId: string, id: string, i: Patch) {
  const db = await getDb();
  const [cur] = await db.select({ id: s.users.id, email: s.users.email, role: s.roles.name, isActive: s.users.isActive }).from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, id));
  if (!cur) throw new HttpError(404, "User not found");
  if (id === actorId && (i.isActive === false || (i.role && i.role !== "ADMIN"))) throw new HttpError(400, "You cannot deactivate or demote your own account");
  const losesAdmin = cur.role === "ADMIN" && cur.isActive && (i.isActive === false || (i.role && i.role !== "ADMIN"));
  if (losesAdmin && (await otherActiveAdmins(id)) === 0) throw new HttpError(409, "At least one active admin is required");
  const role = i.role ?? cur.role;
  if (role === "CONTRIBUTOR") {
    const link = i.contributorId !== undefined ? i.contributorId : undefined;
    if (i.role === "CONTRIBUTOR" && !link) { const [x] = await db.select({ c: s.users.contributorId }).from(s.users).where(eq(s.users.id, id)); if (!x?.c) throw new HttpError(400, "Link a contributor record to a contributor login"); }
  }
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (i.name) set.name = i.name;
  if (i.email && i.email !== cur.email) {
    const [dup] = await db.select({ id: s.users.id }).from(s.users).where(and(eq(s.users.email, i.email), ne(s.users.id, id)));
    if (dup) throw new HttpError(409, "Another user already has that email");
    set.email = i.email;
  }
  if (i.isActive !== undefined) set.isActive = i.isActive;
  if (i.role) { set.roleId = (await ensureRoles())[i.role]; if (i.role !== "CONTRIBUTOR") set.contributorId = null; }
  if (role === "CONTRIBUTOR" && i.contributorId !== undefined) set.contributorId = i.contributorId;
  if (i.password) { if (i.password.length < 10) throw new HttpError(400, "Password must be at least 10 characters"); set.passwordHash = await bcrypt.hash(i.password, 12); }
  await db.update(s.users).set(set as never).where(eq(s.users.id, id));
  await audit(db, { userId: actorId, action: "UPDATE", entity: "user", entityId: id, before: { email: cur.email, role: cur.role, isActive: cur.isActive }, after: { ...i, password: i.password ? "[changed]" : undefined } });
  return { ok: true };
}

/** Deletes a login. Users who have recorded anything (audit trail, payments…) cannot be deleted; disable them instead. */
export async function deleteUser(actorId: string, id: string) {
  const db = await getDb();
  if (id === actorId) throw new HttpError(400, "You cannot delete your own account");
  const [cur] = await db.select({ id: s.users.id, email: s.users.email, role: s.roles.name, isActive: s.users.isActive }).from(s.users).innerJoin(s.roles, eq(s.roles.id, s.users.roleId)).where(eq(s.users.id, id));
  if (!cur) throw new HttpError(404, "User not found");
  if (cur.role === "ADMIN" && cur.isActive && (await otherActiveAdmins(id)) === 0) throw new HttpError(409, "At least one active admin is required");
  try {
    await db.transaction(async (tx) => {
      await tx.delete(s.notifications).where(eq(s.notifications.userId, id));
      await tx.delete(s.users).where(eq(s.users.id, id));
    });
  } catch {
    throw new HttpError(409, "This user has recorded activity (audit trail, payments or approvals), so they can't be deleted. Disable them instead.");
  }
  await audit(db, { userId: actorId, action: "DELETE", entity: "user", entityId: id, before: { email: cur.email, role: cur.role } });
  return { ok: true };
}

export async function resetLink(actorId: string, id: string) {
  const db = await getDb();
  const token = await createResetToken(id);
  await audit(db, { userId: actorId, action: "UPDATE", entity: "user.password", entityId: id, note: "Reset link issued by admin" });
  return { link: `${process.env.NEXTAUTH_URL ?? ""}/reset-password?token=${token}` };
}
