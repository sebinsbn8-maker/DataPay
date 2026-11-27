import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { audit } from "./audit";
import { HttpError, managerScope } from "./guard";
import { D } from "@/lib/calc";
import type { Role } from "@/lib/permissions";

type U = { id: string; role: Role };
export const MAX_LOG_HOURS = 1000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (d: unknown): d is string => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
const monthStartOf = (d: string) => d.slice(0, 8) + "01";
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const n2 = (v: unknown) => D(v as string | number).toDecimalPlaces(2).toNumber();

/** Contributors this user may see: everyone for admins; managers only those assigned within their projects/industries. */
async function visibleContributorIds(u: U): Promise<Set<string> | null> {
  const scope = await managerScope(u);
  if (!scope) return null;
  const db = await getDb();
  const rows = await db.select({ c: s.projectContributors.contributorId, i: s.projectContributors.industryId, p: s.projectContributors.projectId }).from(s.projectContributors);
  return new Set(rows.filter((r) => scope.industryIds.has(r.i) || scope.managedProjectIds.has(r.p)).map((r) => r.c));
}
async function assertVisible(u: U, contributorId: string) {
  const vis = await visibleContributorIds(u);
  if (vis && !vis.has(contributorId)) throw new HttpError(403, "This contributor is not assigned to you");
}

export type LogInput = { contributorId: string; workDate: string; deviceName: string; hours: number; notes?: string | null };
function clean(i: Partial<LogInput>, today?: string) {
  const out: Partial<LogInput> = {};
  if (i.workDate !== undefined) {
    if (!isDate(i.workDate)) throw new HttpError(400, "Choose a valid date");
    if (today && i.workDate > today) throw new HttpError(400, "Working hours can't be recorded for a future date");
    out.workDate = i.workDate;
  }
  if (i.deviceName !== undefined) {
    const d = String(i.deviceName).trim();
    if (!d) throw new HttpError(400, "Enter the device name");
    if (d.length > 120) throw new HttpError(400, "Device name is too long (max 120 characters)");
    out.deviceName = d;
  }
  if (i.hours !== undefined) {
    const h = Number(i.hours);
    if (!Number.isFinite(h) || h <= 0) throw new HttpError(400, "Working hours must be greater than 0");
    if (h > MAX_LOG_HOURS) throw new HttpError(400, `Working hours can't exceed ${MAX_LOG_HOURS}`);
    out.hours = Math.round(h * 100) / 100;
  }
  if (i.notes !== undefined) out.notes = i.notes?.trim() ? i.notes.trim().slice(0, 1000) : null;
  return out;
}

export async function createLog(u: U, i: LogInput, today: string) {
  const db = await getDb();
  await assertVisible(u, i.contributorId);
  const [c] = await db.select({ id: s.contributors.id, status: s.contributors.status }).from(s.contributors).where(eq(s.contributors.id, i.contributorId));
  if (!c) throw new HttpError(404, "Contributor not found");
  const v = clean(i, today) as LogInput;
  if (!v.workDate || !v.deviceName || v.hours === undefined) throw new HttpError(400, "Date, device name and hours are required");
  const [row] = await db.insert(s.contributorHourLogs).values({ contributorId: i.contributorId, workDate: v.workDate, deviceName: v.deviceName, hours: String(v.hours), notes: v.notes ?? null, recordedBy: u.id } as never).returning();
  await audit(db, { userId: u.id, action: "CREATE", entity: "hour_log", entityId: row.id, after: { ...v, contributorId: i.contributorId } });
  return row;
}

export async function updateLog(u: U, id: string, i: Partial<Omit<LogInput, "contributorId">> & { contributorId?: string }, today: string) {
  const db = await getDb();
  const [cur] = await db.select().from(s.contributorHourLogs).where(eq(s.contributorHourLogs.id, id));
  if (!cur) throw new HttpError(404, "Record not found");
  await assertVisible(u, cur.contributorId);
  const set: Record<string, unknown> = { ...clean(i, today), updatedAt: new Date() };
  if (i.contributorId && i.contributorId !== cur.contributorId) {
    await assertVisible(u, i.contributorId);
    const [c] = await db.select({ id: s.contributors.id }).from(s.contributors).where(eq(s.contributors.id, i.contributorId));
    if (!c) throw new HttpError(404, "Contributor not found");
    set.contributorId = i.contributorId;
  }
  if (set.hours !== undefined) set.hours = String(set.hours);
  const [row] = await db.update(s.contributorHourLogs).set(set as never).where(eq(s.contributorHourLogs.id, id)).returning();
  await audit(db, { userId: u.id, action: "UPDATE", entity: "hour_log", entityId: id, before: { contributorId: cur.contributorId, workDate: cur.workDate, deviceName: cur.deviceName, hours: cur.hours, notes: cur.notes }, after: i });
  return row;
}

export async function deleteLog(u: U, id: string) {
  const db = await getDb();
  const [cur] = await db.select().from(s.contributorHourLogs).where(eq(s.contributorHourLogs.id, id));
  if (!cur) throw new HttpError(404, "Record not found");
  await assertVisible(u, cur.contributorId);
  await db.delete(s.contributorHourLogs).where(eq(s.contributorHourLogs.id, id));
  await audit(db, { userId: u.id, action: "DELETE", entity: "hour_log", entityId: id, before: { contributorId: cur.contributorId, workDate: cur.workDate, deviceName: cur.deviceName, hours: cur.hours, notes: cur.notes } });
  return { deleted: true };
}

/** Records with each contributor's total for that day and for that month (all devices). */
export async function listLogs(u: U, f: { contributorId?: string; from?: string; to?: string }) {
  const db = await getDb();
  const vis = await visibleContributorIds(u);
  if (f.contributorId) await assertVisible(u, f.contributorId);
  const rows = await db.select({
    id: s.contributorHourLogs.id, contributorId: s.contributorHourLogs.contributorId, contributorName: s.contributors.fullName, contributorCode: s.contributors.code,
    workDate: s.contributorHourLogs.workDate, deviceName: s.contributorHourLogs.deviceName, hours: s.contributorHourLogs.hours, notes: s.contributorHourLogs.notes,
  }).from(s.contributorHourLogs).innerJoin(s.contributors, eq(s.contributors.id, s.contributorHourLogs.contributorId))
    .where(and(
      f.contributorId ? eq(s.contributorHourLogs.contributorId, f.contributorId) : undefined,
      f.from && isDate(f.from) ? gte(s.contributorHourLogs.workDate, f.from) : undefined,
      f.to && isDate(f.to) ? lte(s.contributorHourLogs.workDate, f.to) : undefined))
    .orderBy(desc(s.contributorHourLogs.workDate), s.contributors.fullName, desc(s.contributorHourLogs.createdAt));
  const shown = vis ? rows.filter((r) => vis.has(r.contributorId)) : rows;
  if (!shown.length) return [];
  // totals for the contributors/months that appear (independent of the date filter, so a month total is always the real month total)
  const ids = [...new Set(shown.map((r) => r.contributorId))];
  const months = [...new Set(shown.map((r) => r.workDate.slice(0, 7)))];
  const lo = months.reduce((a, b) => (a < b ? a : b)) + "-01", hiM = months.reduce((a, b) => (a > b ? a : b));
  const hi = addDays(hiM + "-01", 32).slice(0, 8) + "01";
  const all = await db.select({ c: s.contributorHourLogs.contributorId, d: s.contributorHourLogs.workDate, h: s.contributorHourLogs.hours }).from(s.contributorHourLogs)
    .where(and(inArray(s.contributorHourLogs.contributorId, ids), gte(s.contributorHourLogs.workDate, lo), sql`${s.contributorHourLogs.workDate} < ${hi}`));
  const day = new Map<string, ReturnType<typeof D>>(), mon = new Map<string, ReturnType<typeof D>>();
  for (const a of all) {
    const dk = `${a.c}|${a.d}`, mk = `${a.c}|${a.d.slice(0, 7)}`;
    day.set(dk, (day.get(dk) ?? D(0)).plus(a.h)); mon.set(mk, (mon.get(mk) ?? D(0)).plus(a.h));
  }
  return shown.map((r) => ({ ...r, hours: n2(r.hours), dayTotal: n2(day.get(`${r.contributorId}|${r.workDate}`) ?? 0), monthTotal: n2(mon.get(`${r.contributorId}|${r.workDate.slice(0, 7)}`) ?? 0) }));
}

/** Everything the overview cards need, computed from the stored records on every request (so it always reflects adds / edits / deletes). */
export async function overview(u: U, today: string) {
  if (!isDate(today)) throw new HttpError(400, "Invalid date");
  const db = await getDb();
  const vis = await visibleContributorIds(u);
  const cons = await db.select({ id: s.contributors.id, code: s.contributors.code, fullName: s.contributors.fullName, email: s.contributors.email, phone: s.contributors.phone, status: s.contributors.status }).from(s.contributors).orderBy(s.contributors.fullName);
  const visible = vis ? cons.filter((c) => vis.has(c.id)) : cons;
  const ids = new Set(visible.map((c) => c.id));
  const asg = await db.select({ c: s.projectContributors.contributorId, industry: s.industries.name }).from(s.projectContributors).innerJoin(s.industries, eq(s.industries.id, s.projectContributors.industryId));
  const monthStart = monthStartOf(today), since = addDays(today, -13), sixMonths = (() => { const d = new Date(today + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
  const logs = (await db.select({ c: s.contributorHourLogs.contributorId, d: s.contributorHourLogs.workDate, h: s.contributorHourLogs.hours }).from(s.contributorHourLogs)).filter((l) => ids.has(l.c));

  const per = new Map<string, { today: ReturnType<typeof D>; month: ReturnType<typeof D>; total: ReturnType<typeof D> }>();
  const daily = new Map<string, ReturnType<typeof D>>(), monthly = new Map<string, ReturnType<typeof D>>();
  let todayH = D(0), monthH = D(0), allH = D(0);
  for (const l of logs) {
    const p = per.get(l.c) ?? { today: D(0), month: D(0), total: D(0) };
    p.total = p.total.plus(l.h); allH = allH.plus(l.h);
    if (l.d === today) { p.today = p.today.plus(l.h); todayH = todayH.plus(l.h); }
    if (l.d >= monthStart && l.d <= today) { p.month = p.month.plus(l.h); monthH = monthH.plus(l.h); }
    per.set(l.c, p);
    if (l.d >= since && l.d <= today) daily.set(l.d, (daily.get(l.d) ?? D(0)).plus(l.h));
    if (l.d >= sixMonths && l.d <= today) monthly.set(l.d.slice(0, 7), (monthly.get(l.d.slice(0, 7)) ?? D(0)).plus(l.h));
  }
  const dailySummary = Array.from({ length: 14 }, (_, i) => { const d = addDays(since, i); return { date: d, hours: n2(daily.get(d) ?? 0) }; });
  const monthlySummary = Array.from({ length: 6 }, (_, i) => { const d = new Date(sixMonths + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + i); const k = d.toISOString().slice(0, 7); return { month: k, hours: n2(monthly.get(k) ?? 0) }; });
  return {
    today, monthStart,
    totals: { contributors: visible.length, activeContributors: visible.filter((c) => c.status === "ACTIVE").length, today: n2(todayH), month: n2(monthH), all: n2(allH) },
    contributors: visible.map((c) => {
      const p = per.get(c.id);
      return { ...c, industries: [...new Set(asg.filter((a) => a.c === c.id).map((a) => a.industry))], today: n2(p?.today ?? 0), month: n2(p?.month ?? 0), total: n2(p?.total ?? 0) };
    }),
    dailySummary, monthlySummary,
  };
}
