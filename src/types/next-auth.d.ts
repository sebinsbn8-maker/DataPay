import type { Role } from "@/lib/permissions";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User { role?: Role; contributorId?: string | null }
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; role: Role; contributorId: string | null };
  }
}
declare module "next-auth/jwt" {
  interface JWT { uid?: string; role?: Role; contributorId?: string | null }
}
