import { NextResponse } from "next/server";
import { handle, requirePermission } from "@/server/guard";
import { report, type ReportKind } from "@/server/analytics";
import { toCsv, toPdf, toXlsx } from "@/server/exporters";
import { qs } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  let user;
  try { user = await requirePermission("reports:read"); } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const q = qs(req);
  const kind = (["contributor", "industry", "project"].includes(q.kind ?? "") ? q.kind : "contributor") as ReportKind;
  const format = q.format ?? "xlsx";
  const rows = (await report(user, kind, { from: q.from || undefined, to: q.to || undefined, projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: q.contributorId || undefined })) as Record<string, string | number>[];
  const title = `${kind[0].toUpperCase()}${kind.slice(1)} report`;
  const name = `datapay-${kind}-report-${q.from || "start"}_${q.to || "today"}`;
  const sub = `Period: ${q.from || "all"} to ${q.to || "all"} · Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  const send = (body: BodyInit, type: string, ext: string) => new NextResponse(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}.${ext}"` } });
  if (format === "csv") return send(toCsv(kind, rows), "text/csv; charset=utf-8", "csv");
  if (format === "pdf") return send(new Uint8Array(toPdf(kind, rows, title, sub)), "application/pdf", "pdf");
  return send(new Uint8Array(await toXlsx(kind, rows, title)), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx");
}
void handle;
