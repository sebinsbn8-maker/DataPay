import { handle, requireUser } from "@/server/guard";
import { slipRecipients } from "@/server/slip";

export const dynamic = "force-dynamic";
export const GET = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => slipRecipients(await requireUser(), (await ctx.params).id));
