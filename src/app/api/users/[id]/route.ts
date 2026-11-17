import { handle, requirePermission } from "@/server/guard";
import { updateUser } from "@/server/users";
import { userInput } from "@/server/schemas";

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("users:manage");
  const { id } = await ctx.params;
  return updateUser(u.id, id, userInput.partial().omit({ email: true }).parse(await req.json()));
});
