import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export async function ensureRoles() {
  const db = await getDb();
  const defs = [
    { name: "ADMIN", description: "Full platform access" },
    { name: "MANAGER", description: "Assigned projects/industries: hours, summaries, reports" },
    { name: "CONTRIBUTOR", description: "Own work and payment view only" },
  ];
  for (const d of defs) await db.insert(schema.roles).values(d).onConflictDoNothing();
  const rows = await db.select().from(schema.roles);
  return Object.fromEntries(rows.map((r) => [r.name, r.id])) as Record<"ADMIN" | "MANAGER" | "CONTRIBUTOR", string>;
}

export async function ensureAdmin(email: string, password: string, name = "Administrator") {
  const db = await getDb();
  const roles = await ensureRoles();
  const e = email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, e));
  if (existing) return { created: false, id: existing.id };
  const passwordHash = await bcrypt.hash(password, 12);
  const [u] = await db.insert(schema.users).values({ name, email: e, passwordHash, roleId: roles.ADMIN }).returning();
  return { created: true, id: u.id };
}
