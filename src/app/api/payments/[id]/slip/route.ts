import { NextResponse } from "next/server";
import { HttpError, requireUser } from "@/server/guard";
import { generateSlips } from "@/server/slip";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Payment Acknowledgement Slip (PDF). ?contributorId= for one contributor; omit for every contributor on the statement. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const u = await requireUser();
    const r = await generateSlips(u, (await ctx.params).id, qs(req).contributorId || undefined);
    return new NextResponse(new Uint8Array(r.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.filename}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Could not generate the slip" }, { status: 500 });
  }
}
