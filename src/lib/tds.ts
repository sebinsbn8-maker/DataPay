import { D } from "./calc";

/** TDS (tax deducted at source) withheld from every contributor's earnings. Default 10%; override with the TDS_PERCENT env var. */
export function currentTdsPercent(): number {
  const v = Number(process.env.TDS_PERCENT ?? "10");
  return Number.isFinite(v) && v >= 0 && v <= 100 ? v : 10;
}

/** TDS on one payment line: gross rounded to 2 dp, then × percent, rounded to 2 dp (same rule as the statement lines). */
export const tdsOf = (gross: { toString(): string }, pct: { toString(): string }) =>
  D(gross.toString()).toDecimalPlaces(2).mul(pct.toString()).div(100).toDecimalPlaces(2);
