import { handle, requirePermission } from "@/server/guard";
import { updateIndustry } from "@/server/masterdata";
import { industryInput } from "@/server/schemas";

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("industries:write");
  const { id } = await ctx.params;
  return updateIndustry(u, id, industryInput.partial().parse(await req.json()));
});
