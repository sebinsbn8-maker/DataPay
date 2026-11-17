import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit } from "./audit";
import type { Role } from "@/lib/permissions";

async function loadUser(where: ReturnType<typeof eq>) {
  const db = await getDb();
  const rows = await db
    .select({ u: schema.users, role: schema.roles.name })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
    .where(where)
    .limit(1);
  return rows[0];
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h sessions
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email",
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const row = await loadUser(eq(schema.users.email, email));
        if (!row || !row.u.isActive || !row.u.passwordHash) return null;
        if (!(await bcrypt.compare(password, row.u.passwordHash))) return null;
        const db = await getDb();
        await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, row.u.id));
        await audit(db, { userId: row.u.id, action: "LOGIN", entity: "user", entityId: row.u.id });
        return { id: row.u.id, name: row.u.name, email: row.u.email, role: row.role as Role, contributorId: row.u.contributorId };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET })]
      : []),
  ],
  callbacks: {
    // Google sign-in is allowed ONLY for users an admin already created (no self-registration).
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const row = await loadUser(eq(schema.users.email, email));
      return !!row && row.u.isActive;
    },
    async jwt({ token, user, account }) {
      const email = (user?.email ?? token.email)?.toLowerCase();
      if (user || account) {
        const row = email ? await loadUser(eq(schema.users.email, email)) : undefined;
        if (row) {
          token.uid = row.u.id;
          token.role = row.role as Role;
          token.contributorId = row.u.contributorId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.contributorId = (token.contributorId as string | null) ?? null;
      }
      return session;
    },
  },
};
