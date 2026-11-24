import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { eq } from "drizzle-orm";
import { getDb, schema as s } from "@/db";
import { D } from "@/lib/calc";
import type { Role } from "@/lib/permissions";
import { audit } from "./audit";
import { HttpError, managerScope } from "./guard";
import { LOGO_PNG_B64 } from "./logoData";

type U = { id: string; role: Role; contributorId?: string | null };
type Line = { contributorId: string; contributorName: string; contributorCode: string; rate: string; submitted: string; accepted: string; rejected: string; amount: string; tds?: string; net?: string };

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const two = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const three = (n: number) => (n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + two(n % 100) : "") : two(n));

/** Amount in words, Indian numbering: "Rupees Three Thousand Nine Hundred Eighty Two and Fifty Paise Only". */
export function inrWords(amount: number | string): string {
  const total = Math.round(Number(amount) * 100), rupees = Math.floor(total / 100), paise = total % 100;
  if (!rupees && !paise) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7), lakh = Math.floor((rupees % 1e7) / 1e5), thousand = Math.floor((rupees % 1e5) / 1e3), rest = rupees % 1e3;
  if (crore) parts.push(three(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thousand) parts.push(two(thousand) + " Thousand");
  if (rest) parts.push(three(rest));
  const r = rupees ? `Rupees ${parts.join(" ")}` : "";
  const p = paise ? `${r ? " and " : "Rupees Zero and "}${two(paise)} Paise` : "";
  return `${r}${p} Only`;
}
const rs = (n: number | string) => `Rs. ${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const h = (n: number | string) => (Math.round(Number(n) * 100) / 100).toLocaleString("en-IN");
const METHOD: Record<string, string> = { BANK_TRANSFER: "Bank transfer", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other" };

/** Loads a statement for slip purposes and checks that this user may see it. */
async function loadStatement(u: U, id: string) {
  const db = await getDb();
  const [row] = await db.select({ st: s.industryPaymentStatements, projectName: s.projects.name, industryName: s.industries.name })
    .from(s.industryPaymentStatements)
    .innerJoin(s.projects, eq(s.projects.id, s.industryPaymentStatements.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.industryPaymentStatements.industryId))
    .where(eq(s.industryPaymentStatements.id, id));
  if (!row) throw new HttpError(404, "Statement not found");
  const lines = (row.st.lines ?? []) as unknown as Line[];
  if (u.role === "CONTRIBUTOR") {
    if (!u.contributorId || !lines.some((l) => l.contributorId === u.contributorId)) throw new HttpError(404, "Statement not found");
  } else {
    const scope = await managerScope(u);
    if (scope && !scope.industryIds.has(row.st.industryId) && !scope.managedProjectIds.has(row.st.projectId)) throw new HttpError(403, "This statement is not in your scope");
  }
  const txns = await db.select().from(s.paymentTransactions).where(eq(s.paymentTransactions.statementId, id)).orderBy(s.paymentTransactions.paymentDate);
  return { st: row.st, projectName: row.projectName, industryName: row.industryName, lines, txns };
}

type Recipient = { contributorId: string; code: string; name: string; gross: string; tds: string; net: string; lines: Line[] };
function recipientsOf(lines: Line[]): Recipient[] {
  const m = new Map<string, Recipient>();
  for (const l of lines) {
    const r = m.get(l.contributorId) ?? { contributorId: l.contributorId, code: l.contributorCode, name: l.contributorName, gross: "0", tds: "0", net: "0", lines: [] };
    r.lines.push(l);
    r.gross = D(r.gross).plus(l.amount).toString();
    r.tds = D(r.tds).plus(l.tds ?? 0).toString();
    r.net = D(r.net).plus(l.net ?? l.amount).toString();   // statements made before TDS existed have no net: net = gross
    m.set(l.contributorId, r);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Who a slip can be produced for on this statement (a contributor only ever sees themselves). */
export async function slipRecipients(u: U, statementId: string) {
  const { st, lines } = await loadStatement(u, statementId);
  const db = await getDb();
  const sigs = new Set((await db.select({ id: s.contributorSignatures.contributorId }).from(s.contributorSignatures)).map((x) => x.id));
  const mine = recipientsOf(lines).filter((r) => u.role !== "CONTRIBUTOR" || r.contributorId === u.contributorId);
  return { statementId, code: st.code, status: st.status, recipients: mine.map(({ lines: _l, ...r }) => ({ ...r, hasSignature: sigs.has(r.contributorId) })) };
}

/** Statements that are fully paid and include this contributor, with their net share. */
export async function mySlips(u: U) {
  if (u.role !== "CONTRIBUTOR" || !u.contributorId) return [];
  const db = await getDb();
  const rows = await db.select({ st: s.industryPaymentStatements, projectName: s.projects.name, industryName: s.industries.name })
    .from(s.industryPaymentStatements)
    .innerJoin(s.projects, eq(s.projects.id, s.industryPaymentStatements.projectId))
    .innerJoin(s.industries, eq(s.industries.id, s.industryPaymentStatements.industryId))
    .where(eq(s.industryPaymentStatements.status, "PAID"));
  const out = [];
  for (const r of rows) {
    const me = recipientsOf((r.st.lines ?? []) as unknown as Line[]).find((x) => x.contributorId === u.contributorId);
    if (me) out.push({ statementId: r.st.id, code: r.st.code, projectName: r.projectName, industryName: r.industryName, periodStart: r.st.periodStart, periodEnd: r.st.periodEnd, gross: me.gross, tds: me.tds, net: me.net });
  }
  return out.sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}

export type SlipData = {
  slipNo: string; generatedOn: string; companyName: string;
  contributor: { name: string; code: string; email: string; phone: string | null };
  project: string; industry: string; statementCode: string; periodStart: string; periodEnd: string;
  tdsPercent: string; lines: Line[]; gross: string; tds: string; net: string;
  payments: { date: string; method: string; reference: string }[]; paidOn: string;
  signature: { mime: string; data: string } | null;
};

function drawSlip(doc: jsPDF, d: SlipData) {
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  const navy: [number, number, number] = [17, 17, 47];
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // header
  doc.addImage(`data:image/png;base64,${LOGO_PNG_B64}`, "PNG", M, 40, 36 * (118 / 120), 36);
  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...navy).text(d.companyName, M + 46, 64);
  doc.setFontSize(13).text("PAYMENT ACKNOWLEDGEMENT SLIP", W - M, 56, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(110).text(`Slip No: ${d.slipNo}   ·   Generated: ${d.generatedOn}`, W - M, 72, { align: "right" });
  doc.setDrawColor(210).line(M, 88, W - M, 88);

  autoTable(doc, {
    startY: 100, theme: "plain", styles: { fontSize: 10, cellPadding: 3, textColor: [30, 30, 40] }, margin: { left: M, right: M },
    columnStyles: { 0: { cellWidth: 120, textColor: [110, 110, 120] }, 1: { fontStyle: "bold" } },
    body: [
      ["Contributor", `${d.contributor.name} (${d.contributor.code})`],
      ["Email", d.contributor.email + (d.contributor.phone ? `   ·   ${d.contributor.phone}` : "")],
      ["Project / Industry", `${d.project} / ${d.industry}`],
      ["Payment statement", d.statementCode],
      ["Work period", `${d.periodStart} to ${d.periodEnd}`],
      ["Payment status", "PAID IN FULL"],
      ["Paid on", d.paidOn],
    ],
  });

  autoTable(doc, {
    startY: last() + 14, margin: { left: M, right: M }, styles: { fontSize: 9 }, headStyles: { fillColor: navy },
    head: [["Rate (Rs./h)", "Submitted h", "Accepted h", "Rejected h", "Gross amount"]],
    body: d.lines.map((l) => [rs(l.rate), h(l.submitted), h(l.accepted), h(l.rejected), rs(l.amount)]),
    columnStyles: { 0: { halign: "right" }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  autoTable(doc, {
    startY: last() + 6, theme: "plain", margin: { left: W / 2, right: M }, styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { halign: "left" }, 1: { halign: "right" } },
    body: [["Gross earnings", rs(d.gross)], [`Less: TDS (${Number(d.tdsPercent)}%)`, `- ${rs(d.tds)}`], [{ content: "Net amount paid", styles: { fontStyle: "bold", fontSize: 11 } }, { content: rs(d.net), styles: { fontStyle: "bold", fontSize: 11 } }]],
  });
  let y = last() + 14;
  doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(90).text(`Amount in words: ${inrWords(d.net)}`, M, y, { maxWidth: W - 2 * M });
  y += 22;

  autoTable(doc, {
    startY: y, margin: { left: M, right: M }, styles: { fontSize: 9 }, headStyles: { fillColor: [90, 90, 120] },
    head: [["Payment date", "Mode", "Reference no."]],
    body: d.payments.map((p) => [p.date, p.method, p.reference]),
  });
  y = last() + 22;

  // acknowledgement + signature (keep together on one page)
  if (y > H - 230) { doc.addPage(); y = 60; }
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(30, 30, 40);
  const text = `I, ${d.contributor.name}, acknowledge that I have received the net amount of ${rs(d.net)} (after TDS of ${rs(d.tds)}) for the work done on ${d.project} / ${d.industry} for the period ${d.periodStart} to ${d.periodEnd}, as per payment statement ${d.statementCode}. This amount is accepted in full settlement of that statement.`;
  const wrapped = doc.splitTextToSize(text, W - 2 * M) as string[];
  doc.text(wrapped, M, y);
  y += wrapped.length * 13 + 14;

  const boxW = 190, boxH = 62;
  if (d.signature) {
    const url = `data:${d.signature.mime};base64,${d.signature.data}`;
    try {
      const p = doc.getImageProperties(url);
      const k = Math.min(boxW / p.width, boxH / p.height);
      doc.addImage(url, d.signature.mime === "image/png" ? "PNG" : "JPEG", M, y + (boxH - p.height * k), p.width * k, p.height * k);
    } catch { doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(150).text("(signature image could not be read)", M, y + boxH - 8); }
  } else doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(150).text("(signature not on file)", M, y + boxH - 8);
  doc.setDrawColor(60).line(M, y + boxH + 4, M + boxW + 20, y + boxH + 4);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(70);
  doc.text("Signature of contributor", M, y + boxH + 16);
  doc.text(d.contributor.name, M, y + boxH + 28);
  doc.text(`Date: ${d.paidOn}`, W - M, y + boxH + 16, { align: "right" });

  doc.setFontSize(8).setTextColor(150).text(`Computer-generated by ${d.companyName} as proof of payment. Slip ${d.slipNo}.`, W / 2, H - 28, { align: "center" });
}

/** PDF with one slip per page. Only available once the statement is fully paid. */
export async function generateSlips(u: U, statementId: string, contributorId?: string) {
  const { st, projectName, industryName, lines, txns } = await loadStatement(u, statementId);
  if (st.status !== "PAID") throw new HttpError(409, "The payment acknowledgement slip is available once the statement is fully paid.");
  let recipients = recipientsOf(lines);
  if (u.role === "CONTRIBUTOR") recipients = recipients.filter((r) => r.contributorId === u.contributorId);
  else if (contributorId) recipients = recipients.filter((r) => r.contributorId === contributorId);
  if (!recipients.length) throw new HttpError(404, "No contributor found on this statement");

  const db = await getDb();
  const cons = await db.select().from(s.contributors);
  const sigs = await db.select().from(s.contributorSignatures);
  const paidOn = txns.length ? txns[txns.length - 1].paymentDate : st.updatedAt.toISOString().slice(0, 10);
  const company = process.env.COMPANY_NAME || "DataPay";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  recipients.forEach((r, i) => {
    const c = cons.find((x) => x.id === r.contributorId);
    const sig = sigs.find((x) => x.contributorId === r.contributorId);
    if (i) doc.addPage();
    drawSlip(doc, {
      slipNo: `ACK-${st.code}-${r.code}`, generatedOn: new Date().toISOString().slice(0, 10), companyName: company,
      contributor: { name: r.name, code: r.code, email: c?.email ?? "", phone: c?.phone ?? null },
      project: projectName, industry: industryName, statementCode: st.code, periodStart: st.periodStart, periodEnd: st.periodEnd,
      tdsPercent: st.tdsPercent, lines: r.lines, gross: r.gross, tds: r.tds, net: r.net,
      payments: txns.map((t) => ({ date: t.paymentDate, method: METHOD[t.method] ?? t.method, reference: t.referenceNumber })), paidOn,
      signature: sig ? { mime: sig.mime, data: sig.data } : null,
    });
  });
  await audit(db, { userId: u.id, action: "SLIP", entity: "payment_statement", entityId: statementId, note: `slip generated: ${recipients.map((r) => r.code).join(", ")}` });
  return {
    pdf: Buffer.from(doc.output("arraybuffer")),
    filename: recipients.length === 1 ? `payment-slip-ACK-${st.code}-${recipients[0].code}.pdf` : `payment-slips-${st.code}.pdf`,
  };
}
