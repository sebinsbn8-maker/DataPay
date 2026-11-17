import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = Decimal.Value;
export const D = (v: Num | null | undefined) => new Decimal(v ?? 0);

/** Accepted = Submitted x Pct / 100. Never rounded here (DB column keeps 6 dp). */
export function acceptedHours(submitted: Num, pct: Num): Decimal {
  return D(submitted).mul(D(pct)).div(100);
}

export function rejectedHours(submitted: Num, accepted: Num): Decimal {
  return D(submitted).minus(D(accepted));
}

/** Productivity = hours / target x 100. Returns 0 when target is 0. */
export function productivityPct(hours: Num, target: Num): Decimal {
  const t = D(target);
  return t.isZero() ? D(0) : D(hours).div(t).mul(100);
}

/** Payable = accepted x rate, rounded to 2 dp (money) only at the very end. */
export function payable(accepted: Num, rate: Num): Decimal {
  return D(accepted).mul(D(rate)).toDecimalPlaces(2);
}

export type QcStatusValue =
  | "PENDING" | "PARTIALLY_ACCEPTED" | "FULLY_ACCEPTED" | "REJECTED" | "RESUBMITTED";

export function deriveQcStatus(pct: Num | null | undefined): QcStatusValue {
  if (pct === null || pct === undefined || pct === "") return "PENDING";
  const p = D(pct);
  if (p.isZero()) return "REJECTED";
  if (p.gte(100)) return "FULLY_ACCEPTED";
  return "PARTIALLY_ACCEPTED";
}

export function validatePct(pct: Num): void {
  const p = D(pct);
  if (p.isNaN() || p.lt(0) || p.gt(100)) throw new Error("Acceptance percentage must be between 0 and 100");
}

/**
 * Industry-level QC allocation (method: PRO_RATA_BY_SUBMITTED).
 * The client accepted `totalAccepted` hours out of the industry's submissions.
 * Each record gets a share proportional to its submitted hours; remainders at
 * 6 dp go to the largest records so the allocated total matches exactly.
 */
export function allocateIndustryAcceptance(
  items: { id: string; submitted: Num }[],
  industryPct: Num,
): { id: string; submitted: Decimal; accepted: Decimal; pct: Decimal }[] {
  validatePct(industryPct);
  const totalSubmitted = items.reduce((s, i) => s.plus(D(i.submitted)), D(0));
  const target = totalSubmitted.mul(D(industryPct)).div(100).toDecimalPlaces(6);
  const out = items.map((i) => {
    const raw = totalSubmitted.isZero() ? D(0) : D(i.submitted).mul(target).div(totalSubmitted);
    return { id: i.id, submitted: D(i.submitted), accepted: raw.toDecimalPlaces(6, Decimal.ROUND_DOWN) };
  });
  let remainder = target.minus(out.reduce((s, o) => s.plus(o.accepted), D(0)));
  const step = D("0.000001");
  const order = [...out].sort((a, b) => b.submitted.comparedTo(a.submitted));
  let i = 0;
  while (remainder.gt(0) && order.length) {
    order[i % order.length].accepted = order[i % order.length].accepted.plus(step);
    remainder = remainder.minus(step);
    i++;
  }
  return out.map((o) => ({
    ...o,
    pct: o.submitted.isZero() ? D(0) : o.accepted.div(o.submitted).mul(100),
  }));
}

/* ---------- rate resolution: CONTRIBUTOR > INDUSTRY > PROJECT, latest effectiveFrom <= date ---------- */
export type RateRow = {
  scope: "PROJECT" | "INDUSTRY" | "CONTRIBUTOR";
  projectId: string | null;
  industryId: string | null;
  assignmentId: string | null;
  hourlyRate: string;
  effectiveFrom: string; // YYYY-MM-DD
};

export function resolveRate(
  rates: RateRow[],
  ctx: { projectId: string; industryId: string; assignmentId: string },
  onDate: string,
): { rate: Decimal; scope: RateRow["scope"]; effectiveFrom: string } | null {
  const pick = (scope: RateRow["scope"], match: (r: RateRow) => boolean) =>
    rates
      .filter((r) => r.scope === scope && match(r) && r.effectiveFrom <= onDate)
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  const hit =
    pick("CONTRIBUTOR", (r) => r.assignmentId === ctx.assignmentId) ??
    pick("INDUSTRY", (r) => r.industryId === ctx.industryId) ??
    pick("PROJECT", (r) => r.projectId === ctx.projectId);
  return hit ? { rate: D(hit.hourlyRate), scope: hit.scope, effectiveFrom: hit.effectiveFrom } : null;
}

export const fmtHours = (v: Num) => D(v).toDecimalPlaces(2).toString();
export const fmtMoney = (v: Num) =>
  "₹" + D(v).toDecimalPlaces(2).toNumber().toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
