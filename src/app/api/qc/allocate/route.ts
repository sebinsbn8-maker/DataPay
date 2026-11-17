import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { allocateIndustry } from "@/server/qc";

export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("qc:write");
  return allocateIndustry(u, z.object({ industryId: z.string().uuid(), from: z.string(), to: z.string(), pct: z.coerce.number().min(0).max(100), reference: z.string().optional(), overwriteIndividual: z.boolean().optional() }).parse(await req.json()));
});
