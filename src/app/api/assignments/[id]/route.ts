import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { updateAssignment } from "@/server/masterdata";

const patch = z.object({
  dailyTargetHours: z.coerce.number().nonnegative().optional(),
  weeklyTargetHours: z.coerce.number().nonnegative().optional(),
  monthlyTargetHours: z.coerce.number().nonnegative().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});
export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("contributors:write");
  const { id } = await ctx.params;
  return updateAssignment(u, id, patch.parse(await req.json()));
});
