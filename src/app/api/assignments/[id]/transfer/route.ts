import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { transferAssignment } from "@/server/masterdata";
import { today } from "@/server/schemas";

export const POST = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("contributors:write");
  const { id } = await ctx.params;
  const b = z.object({ industryId: z.string().uuid(), effectiveDate: z.string().optional() }).parse(await req.json());
  return transferAssignment(u, id, b.industryId, b.effectiveDate ?? today());
});
