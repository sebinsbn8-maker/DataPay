import { handle, requirePermission } from "@/server/guard";
import { createUser, listUsers } from "@/server/users";
import { userInput } from "@/server/schemas";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => { await requirePermission("users:manage"); return listUsers(); });
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("users:manage");
  return createUser(u.id, userInput.parse(await req.json()));
});
