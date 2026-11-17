import { handle, requireUser } from "@/server/guard";
import { statementDetail } from "@/server/payments";

export const dynamic = "force-dynamic";
export const GET = (_: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => statementDetail(await requireUser(["ADMIN", "MANAGER"]), (await ctx.params).id));
