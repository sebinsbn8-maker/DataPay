import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { HOME_BY_ROLE } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  redirect(session?.user ? HOME_BY_ROLE[session.user.role] : "/login");
}
