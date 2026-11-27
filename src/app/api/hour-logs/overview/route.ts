import { handle, requirePermission } from "@/server/guard";
import { overview } from "@/server/hourlog";
import { qs, today } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requirePermission("hours:write");
  return overview(u, qs(req).today || today());
});
