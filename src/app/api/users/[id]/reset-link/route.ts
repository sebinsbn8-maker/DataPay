import { handle, requirePermission } from "@/server/guard";
import { resetLink } from "@/server/users";

export const POST = (_: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("users:manage");
  return resetLink(u.id, (await ctx.params).id);
});
