import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { entrySheet, saveEntries, hoursTotals } from "@/server/hours";
import { qs, today } from "@/server/http";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requirePermission("hours:write");
  const q = qs(req);
  const date = q.date ?? today();
  const [rows, totals] = await Promise.all([
    entrySheet(u, date, { projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: q.contributorId || undefined }),
    hoursTotals(u, { from: date, to: date, projectId: q.projectId || undefined, industryId: q.industryId || undefined, contributorId: q.contributorId || undefined }),
  ]);
  return { rows, totals };
});

const entry = z.object({
  assignmentId: z.string().uuid(),
  sessions: z.array(z.object({ startTime: z.string().nullable().optional(), endTime: z.string().nullable().optional(), hours: z.coerce.number().min(0).max(1000), note: z.string().nullable().optional() })).max(10),
  submittedHours: z.coerce.number().min(0).max(1000),
  remarks: z.string().nullable().optional(),
});
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("hours:write");
  const b = z.object({ date: z.string(), entries: z.array(entry).min(1).max(500) }).parse(await req.json());
  return saveEntries(u, b.date, b.entries);
});
