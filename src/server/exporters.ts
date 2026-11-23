import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportKind } from "./analytics";

type Col = { key: string; header: string; money?: boolean };
export const REPORT_COLS: Record<ReportKind, Col[]> = {
  contributor: [
    { key: "contributor", header: "Contributor" }, { key: "project", header: "Project" }, { key: "industry", header: "Industry" },
    { key: "target", header: "Target h" }, { key: "submitted", header: "Submitted h" }, { key: "accepted", header: "Accepted h" }, { key: "rejected", header: "Rejected h" },
    { key: "acceptancePct", header: "Acceptance %" }, { key: "productivityPct", header: "Productivity %" }, { key: "rate", header: "Hourly rate", money: true },
    { key: "gross", header: "Gross", money: true }, { key: "tds", header: "TDS", money: true }, { key: "payable", header: "Net payable", money: true }, { key: "paymentStatus", header: "Payment status" },
  ],
  industry: [
    { key: "industry", header: "Industry" }, { key: "project", header: "Project" }, { key: "contributors", header: "Contributors" }, { key: "target", header: "Target h" },
    { key: "submitted", header: "Submitted h" }, { key: "accepted", header: "Accepted h" }, { key: "rejected", header: "Rejected h" }, { key: "acceptancePct", header: "Acceptance %" },
    { key: "productivityPct", header: "Productivity %" }, { key: "gross", header: "Gross", money: true }, { key: "tds", header: "TDS", money: true }, { key: "payable", header: "Net payable", money: true }, { key: "paid", header: "Paid", money: true }, { key: "outstanding", header: "Outstanding", money: true },
  ],
  project: [
    { key: "project", header: "Project" }, { key: "industries", header: "Industries" }, { key: "contributors", header: "Contributors" }, { key: "submitted", header: "Submitted h" },
    { key: "accepted", header: "Accepted h" }, { key: "rejected", header: "Rejected h" }, { key: "acceptancePct", header: "Acceptance %" },
    { key: "gross", header: "Gross", money: true }, { key: "tds", header: "TDS", money: true }, { key: "payable", header: "Net payment", money: true }, { key: "paid", header: "Paid", money: true }, { key: "remaining", header: "Remaining", money: true },
  ],
};

type Row = Record<string, string | number>;
const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(kind: ReportKind, rows: Row[]) {
  const cols = REPORT_COLS[kind];
  return [cols.map((c) => csvCell(c.header)).join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(","))].join("\n");
}

export async function toXlsx(kind: ReportKind, rows: Row[], title: string) {
  const cols = REPORT_COLS[kind];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: Math.max(14, c.header.length + 4), style: c.money ? { numFmt: '"₹"#,##0.00' } : {} }));
  rows.forEach((r) => ws.addRow(Object.fromEntries(cols.map((c) => [c.key, r[c.key]]))));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF11112F" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(kind: ReportKind, rows: Row[], title: string, subtitle: string) {
  const cols = REPORT_COLS[kind];
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16); doc.text(`DataPay — ${title}`, 40, 40);
  doc.setFontSize(9); doc.setTextColor(110); doc.text(subtitle, 40, 56);
  const fmt = (c: Col, v: unknown) => (c.money ? `Rs. ${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : String(v ?? ""));
  autoTable(doc, { startY: 70, head: [cols.map((c) => c.header)], body: rows.map((r) => cols.map((c) => fmt(c, r[c.key]))), styles: { fontSize: 8 }, headStyles: { fillColor: [17, 17, 47] }, margin: { left: 40, right: 40 } });
  return Buffer.from(doc.output("arraybuffer"));
}
