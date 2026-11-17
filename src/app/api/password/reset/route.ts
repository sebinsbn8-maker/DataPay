import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeResetToken } from "@/server/passwordReset";

export async function POST(req: Request) {
  try {
    const { token, password } = z.object({ token: z.string().min(20), password: z.string() }).parse(await req.json());
    await consumeResetToken(token, password);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 });
  }
}
