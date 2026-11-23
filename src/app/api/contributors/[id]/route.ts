import { handle, requirePermission, requireUser } from "@/server/guard";
import { contributorHistory, updateContributor, deleteContributor } from "@/server/masterdata";
import { contributorInput } from "@/server/schemas";

export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requireUser();
  const { id } = await ctx.params;
  if (u.role === "CONTRIBUTOR" && u.contributorId !== id) throw new (await import("@/server/guard")).HttpError(403, "Forbidden");
  return contributorHistory(id);
});
export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("contributors:write");
  const { id } = await ctx.params;
  return updateContributor(u, id, contributorInput.partial().parse(await req.json()));
});

export const DELETE = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("contributors:write");
  const { id } = await ctx.params;
  return deleteContributor(u, id, new URL(req.url).searchParams.get("force") === "1");
});
