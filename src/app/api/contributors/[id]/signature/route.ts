import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireUser, HttpError } from "@/server/guard";
import { assertCanView, getSignature, removeSignature, setSignature } from "@/server/signatures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const { id } = await ctx.params;
    assertCanView(u, id);
    const sig = await getSignature(id);
    if (!sig) return NextResponse.json({ error: "No signature" }, { status: 404 });
    return new NextResponse(new Uint8Array(Buffer.from(sig.data, "base64")), { headers: { "Content-Type": sig.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
export const PUT = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requireUser();
  const { dataUrl } = z.object({ dataUrl: z.string().max(700_000) }).parse(await req.json());
  return setSignature(u, (await ctx.params).id, dataUrl);
});
export const DELETE = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => removeSignature(await requireUser(), (await ctx.params).id));
