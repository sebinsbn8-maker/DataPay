import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { previewStatement } from "@/server/payments";

export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("payments:write");
  const b = z.object({ industryId: z.string().uuid(), from: z.string(), to: z.string() }).parse(await req.json());
  return previewStatement(u, b.industryId, b.from, b.to);
});
