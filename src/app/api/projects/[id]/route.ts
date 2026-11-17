import { handle, requirePermission } from "@/server/guard";
import { updateProject } from "@/server/masterdata";
import { projectInput } from "@/server/schemas";

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("projects:write");
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = body.archive ? { archivedAt: new Date(), status: "COMPLETED" } : projectInput.parse(body);
  return updateProject(u, id, parsed as Record<string, unknown>);
});
