import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { deleteLog, updateLog } from "@/server/hourlog";

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("hours:write");
  const b = z.object({
    contributorId: z.string().uuid().optional(), workDate: z.string().optional(), deviceName: z.string().optional(),
    hours: z.coerce.number().optional(), notes: z.string().nullable().optional(), today: z.string(),
  }).parse(await req.json());
  const { today, ...rest } = b;
  return updateLog(u, (await ctx.params).id, rest, today);
});
export const DELETE = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("hours:write");
  return deleteLog(u, (await ctx.params).id);
});
