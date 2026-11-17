import { handle, requirePermission, requireUser } from "@/server/guard";
import { createRate, listRates } from "@/server/masterdata";
import { rateInput } from "@/server/schemas";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => { await requirePermission("rates:write"); return listRates(); });
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("rates:write");
  return createRate(u, rateInput.parse(await req.json()));
});
void requireUser;
