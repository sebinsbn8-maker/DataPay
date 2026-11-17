import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "./auth";
import { can, type Permission, type Role } from "@/lib/permissions";
import { getDb, schema } from "@/db";
import { and, eq, or } from "drizzle-orm";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(roles?: Role[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new HttpError(401, "Not signed in");
  if (roles && !roles.includes(session.user.role)) throw new HttpError(403, "Forbidden");
  return session.user;
}

export async function requirePermission(p: Permission) {
  const user = await requireUser();
  if (!can(user.role, p)) throw new HttpError(403, "You do not have permission for this action");
  return user;
}

/** Project/industry ids a manager may touch. Admin => null (unrestricted). */
export async function managerScope(user: { id: string; role: Role }) {
  if (user.role === "ADMIN") return null;
  const db = await getDb();
  const projs = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.managerId, user.id));
  const inds = await db.select({ id: schema.industries.id, projectId: schema.industries.projectId })
    .from(schema.industries).where(eq(schema.industries.managerId, user.id));
  return {
    projectIds: new Set([...projs.map((p) => p.id), ...inds.map((i) => i.projectId)]),
    industryIds: new Set(inds.map((i) => i.id)),
    managedProjectIds: new Set(projs.map((p) => p.id)),
  };
}

export async function assertIndustryAccess(user: { id: string; role: Role }, industryId: string) {
  const scope = await managerScope(user);
  if (!scope) return;
  const db = await getDb();
  const [ind] = await db.select().from(schema.industries).where(eq(schema.industries.id, industryId));
  if (!ind) throw new HttpError(404, "Industry not found");
  if (!scope.industryIds.has(industryId) && !scope.managedProjectIds.has(ind.projectId))
    throw new HttpError(403, "This industry is not assigned to you");
}

/** Wrap a route handler: converts HttpError / zod errors to clean JSON responses. */
export function handle<T>(fn: () => Promise<T>) {
  return fn()
    .then((data) => NextResponse.json(data))
    .catch((e: unknown) => {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) {
        const issues = (e as { issues: { path: (string | number)[]; message: string }[] }).issues;
        return NextResponse.json({ error: issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      }
      console.error(e);
      const msg = e instanceof Error ? e.message : "Server error";
      const dup = /duplicate key|unique/i.test(msg);
      return NextResponse.json({ error: dup ? "A record with these details already exists" : msg }, { status: dup ? 409 : 500 });
    });
}
void and; void or;
