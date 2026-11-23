import Decimal from "decimal.js";
import { D, productivityPct } from "./calc";
import { tdsOf } from "./tds";

export type Fact = {
  recordId: string; date: string;
  projectId: string; projectName: string; industryId: string; industryName: string;
  contributorId: string; contributorName: string; contributorCode: string; assignmentId: string;
  target: string; actual: string; submitted: string;
  pct: string | null; accepted: string; rejected: string; pending: string; // pending = submitted while QC not yet received
  qcStatus: string; statementId: string | null;
  rate: string | null; amount: string; // amount = exact accepted x rate (frozen once billed) = GROSS, before TDS
  tdsPercent: string;                  // statement's frozen TDS % when billed, otherwise the current TDS %
};

export type Agg = {
  key: string; name: string; records: number; contributors: number;
  target: Decimal; actual: Decimal; submitted: Decimal; accepted: Decimal; rejected: Decimal; pending: Decimal; amount: Decimal; tds: Decimal; net: Decimal; // amount = gross, net = gross - tds
  acceptancePct: Decimal;        // accepted / client-reviewed submitted
  submittedProductivity: Decimal; acceptedProductivity: Decimal; // vs target hours
};

/**
 * Money rule (single source of truth): an amount is rounded to 2 dp per contributor, per applicable rate,
 * per statement (unbilled hours form their own group). This is exactly how payment statements bill, so
 * dashboard, reports, payments and statements always agree to the paisa.
 */
export function aggregate(facts: Fact[], by: (f: Fact) => { key: string; name: string }): Agg[] {
  const map = new Map<string, Agg & { _c: Set<string>; _m: Map<string, { sum: Decimal; pct: string }> }>();
  for (const f of facts) {
    const { key, name } = by(f);
    const a = map.get(key) ?? { key, name, records: 0, contributors: 0, target: D(0), actual: D(0), submitted: D(0), accepted: D(0), rejected: D(0), pending: D(0), amount: D(0), tds: D(0), net: D(0), acceptancePct: D(0), submittedProductivity: D(0), acceptedProductivity: D(0), _c: new Set<string>(), _m: new Map<string, { sum: Decimal; pct: string }>() };
    a.records++; a._c.add(f.contributorId);
    a.target = a.target.plus(f.target); a.actual = a.actual.plus(f.actual); a.submitted = a.submitted.plus(f.submitted);
    a.accepted = a.accepted.plus(f.accepted); a.rejected = a.rejected.plus(f.rejected); a.pending = a.pending.plus(f.pending);
    const mk = `${f.contributorId}|${f.rate ?? "-"}|${f.statementId ?? "unbilled"}`;
    const g = a._m.get(mk) ?? { sum: D(0), pct: f.tdsPercent };
    a._m.set(mk, { sum: g.sum.plus(f.amount), pct: g.pct });
    map.set(key, a);
  }
  return [...map.values()].map(({ _c, _m, ...a }) => {
    const reviewed = a.submitted.minus(a.pending);
    const amount = [..._m.values()].reduce((t, v) => t.plus(v.sum.toDecimalPlaces(2)), D(0));
    const tds = [..._m.values()].reduce((t, v) => t.plus(tdsOf(v.sum, v.pct)), D(0));
    return { ...a, contributors: _c.size, amount, tds, net: amount.minus(tds),
      acceptancePct: reviewed.gt(0) ? a.accepted.div(reviewed).mul(100) : D(0),
      submittedProductivity: productivityPct(a.submitted, a.target), acceptedProductivity: productivityPct(a.accepted, a.target) };
  });
}

export const totals = (facts: Fact[]) => aggregate(facts, () => ({ key: "all", name: "All" }))[0]
  ?? { key: "all", name: "All", records: 0, contributors: 0, target: D(0), actual: D(0), submitted: D(0), accepted: D(0), rejected: D(0), pending: D(0), amount: D(0), tds: D(0), net: D(0), acceptancePct: D(0), submittedProductivity: D(0), acceptedProductivity: D(0) };

/** Group facts into payment lines: one per contributor per applicable rate (rate may change inside a period). */
export function lineize(facts: Fact[]) {
  const m = new Map<string, { contributorId: string; contributorName: string; contributorCode: string; rate: string; tdsPercent: string; submitted: Decimal; accepted: Decimal; rejected: Decimal; exact: Decimal }>();
  for (const f of facts) {
    if (!f.rate) continue;
    const k = `${f.contributorId}|${f.rate}|${f.tdsPercent}`;
    const l = m.get(k) ?? { contributorId: f.contributorId, contributorName: f.contributorName, contributorCode: f.contributorCode, rate: f.rate, tdsPercent: f.tdsPercent, submitted: D(0), accepted: D(0), rejected: D(0), exact: D(0) };
    l.submitted = l.submitted.plus(f.submitted); l.accepted = l.accepted.plus(f.accepted); l.rejected = l.rejected.plus(f.rejected); l.exact = l.exact.plus(f.amount);
    m.set(k, l);
  }
  return [...m.values()].map(({ exact, ...l }) => {
    const amount = exact.toDecimalPlaces(2), tds = tdsOf(amount, l.tdsPercent);
    return { ...l, amount, tds, net: amount.minus(tds) };
  });
}
