import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { createResetToken } from "@/server/passwordReset";

// Always answers the same way so the endpoint can't be used to discover which emails exist.
export async function POST(req: Request) {
  const { email } = z.object({ email: z.string().email() }).parse(await req.json());
  const db = await getDb();
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  if (u?.isActive) {
    const token = await createResetToken(u.id);
    const link = `${process.env.NEXTAUTH_URL ?? ""}/reset-password?token=${token}`;
    // No SMTP is configured by default: surface the request to admins and log the link server-side.
    const admins = await db.select({ id: schema.users.id }).from(schema.users)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId)).where(eq(schema.roles.name, "ADMIN"));
    for (const a of admins)
      await db.insert(schema.notifications).values({ userId: a.id, title: `Password reset requested: ${u.email}`, body: `Reset link (valid 1 hour): ${link}`, link: "/users" });
    console.info(`[password reset] ${u.email}: ${link}`);
  }
  return NextResponse.json({ ok: true });
}
