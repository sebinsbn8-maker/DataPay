import { describe, it, expect } from "vitest";
import {
  acceptedHours, rejectedHours, productivityPct, payable, deriveQcStatus,
  allocateIndustryAcceptance, resolveRate, D,
} from "../src/lib/calc";

describe("acceptance maths (spec examples)", () => {
  it("10h @ 90% = 9h accepted", () => expect(acceptedHours(10, 90).toString()).toBe("9"));
  it("10h @ 87% = 8.7h accepted, 1.3h rejected", () => {
    const a = acceptedHours(10, 87);
    expect(a.toString()).toBe("8.7");
    expect(rejectedHours(10, a).toString()).toBe("1.3");
  });
  it("does not round prematurely", () => expect(acceptedHours("7.333", "87.5").toString()).toBe("6.416375"));
});

describe("productivity (spec example: John)", () => {
  it("submitted 87.5%, accepted 78.75%", () => {
    expect(productivityPct(7, 8).toString()).toBe("87.5");
    expect(productivityPct(6.3, 8).toString()).toBe("78.75");
  });
  it("zero target is safe", () => expect(productivityPct(5, 0).toString()).toBe("0"));
});

describe("payments (spec example: Manufacturing)", () => {
  it("A 9h x 250 = 2250, B 8.7h x 250 = 2175, total 4425", () => {
    const a = payable(9, 250), b = payable(8.7, 250);
    expect(a.toString()).toBe("2250");
    expect(b.toString()).toBe("2175");
    expect(a.plus(b).toString()).toBe("4425");
  });
});

describe("qc status", () => {
  it("derives from pct", () => {
    expect(deriveQcStatus(null)).toBe("PENDING");
    expect(deriveQcStatus(0)).toBe("REJECTED");
    expect(deriveQcStatus(100)).toBe("FULLY_ACCEPTED");
    expect(deriveQcStatus(87)).toBe("PARTIALLY_ACCEPTED");
  });
});

describe("industry-level allocation", () => {
  it("allocated total equals industry accepted total exactly", () => {
    const r = allocateIndustryAcceptance(
      [{ id: "a", submitted: 10 }, { id: "b", submitted: 7 }, { id: "c", submitted: 3.3333 }], 91.7);
    const total = r.reduce((s, x) => s.plus(x.accepted), D(0));
    expect(total.toString()).toBe(D(20.3333).mul(91.7).div(100).toDecimalPlaces(6).toString());
  });
  it("rejects out-of-range pct", () => {
    expect(() => allocateIndustryAcceptance([{ id: "a", submitted: 1 }], 101)).toThrow();
  });
});

describe("rate resolution", () => {
  const base = { projectId: "p", industryId: "i", assignmentId: "c" };
  const rates = [
    { scope: "PROJECT", projectId: "p", industryId: null, assignmentId: null, hourlyRate: "200", effectiveFrom: "2026-01-01" },
    { scope: "INDUSTRY", projectId: "p", industryId: "i", assignmentId: null, hourlyRate: "250", effectiveFrom: "2026-01-01" },
    { scope: "INDUSTRY", projectId: "p", industryId: "i", assignmentId: null, hourlyRate: "275", effectiveFrom: "2026-06-01" },
    { scope: "CONTRIBUTOR", projectId: null, industryId: null, assignmentId: "c", hourlyRate: "300", effectiveFrom: "2026-03-01" },
  ] as const;
  it("contributor beats industry beats project", () => {
    expect(resolveRate([...rates], base, "2026-04-01")!.rate.toString()).toBe("300");
    expect(resolveRate([...rates], { ...base, assignmentId: "x" }, "2026-04-01")!.rate.toString()).toBe("250");
    expect(resolveRate([...rates], { ...base, assignmentId: "x", industryId: "z" }, "2026-04-01")!.rate.toString()).toBe("200");
  });
  it("effective date: a later rate does not apply to earlier dates", () => {
    expect(resolveRate([...rates], { ...base, assignmentId: "x" }, "2026-05-31")!.rate.toString()).toBe("250");
    expect(resolveRate([...rates], { ...base, assignmentId: "x" }, "2026-06-01")!.rate.toString()).toBe("275");
  });
  it("no rate configured returns null", () => expect(resolveRate([], base, "2026-01-01")).toBeNull());
});
