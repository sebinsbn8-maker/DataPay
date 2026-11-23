import { handle, requirePermission } from "@/server/guard";
import { updateIndustry, deleteIndustry } from "@/server/masterdata";
import { industryInput } from "@/server/schemas";

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("industries:write");
  const { id } = await ctx.params;
  return updateIndustry(u, id, industryInput.partial().parse(await req.json()));
});

export const DELETE = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("industries:write");
  const { id } = await ctx.params;
  return deleteIndustry(u, id, new URL(req.url).searchParams.get("force") === "1");
});
