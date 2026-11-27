import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { createLog, listLogs } from "@/server/hourlog";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requirePermission("hours:write");
  const q = qs(req);
  return listLogs(u, { contributorId: q.contributorId || undefined, from: q.from || undefined, to: q.to || undefined });
});
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("hours:write");
  const b = z.object({
    contributorId: z.string().uuid("Select a contributor"), workDate: z.string(), deviceName: z.string(), hours: z.coerce.number(),
    notes: z.string().nullable().optional(), today: z.string(),
  }).parse(await req.json());
  return createLog(u, b, b.today);
});
