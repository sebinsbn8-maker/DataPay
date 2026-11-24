import {
  pgTable, pgEnum, uuid, text, varchar, boolean, timestamp, date, numeric,
  integer, jsonb, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ---------- enums ---------- */
export const projectStatus = pgEnum("project_status", ["ACTIVE", "PAUSED", "COMPLETED"]);
export const entityStatus = pgEnum("entity_status", ["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const qcStatus = pgEnum("qc_status", [
  "PENDING", "PARTIALLY_ACCEPTED", "FULLY_ACCEPTED", "REJECTED", "RESUBMITTED",
]);
export const rateScope = pgEnum("rate_scope", ["PROJECT", "INDUSTRY", "CONTRIBUTOR"]);
export const statementStatus = pgEnum("statement_status", [
  "NOT_READY", "PENDING_APPROVAL", "APPROVED", "PARTIALLY_PAID", "PAID", "VOID",
]);
export const acceptanceSource = pgEnum("acceptance_source", ["INDIVIDUAL", "INDUSTRY_ALLOCATION"]);

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const hours = (name: string) => numeric(name, { precision: 14, scale: 6 });
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });

/* ---------- 1-2. roles & users ---------- */
export const roles = pgTable("roles", {
  id: id(),
  name: varchar("name", { length: 20 }).notNull().unique(), // ADMIN | MANAGER | CONTRIBUTOR
  description: text("description"),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: varchar("google_id", { length: 100 }).unique(),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  contributorId: uuid("contributor_id"), // set when role = CONTRIBUTOR
  isActive: boolean("is_active").notNull().default(true),
  resetToken: text("reset_token"),
  resetTokenExpiresAt: timestamp("reset_token_expires_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------- 3. projects ---------- */
export const projects = pgTable("projects", {
  id: id(),
  code: varchar("code", { length: 20 }).notNull().unique(), // auto: PRJ-0001
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  description: text("description"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: projectStatus("status").notNull().default("ACTIVE"),
  managerId: uuid("manager_id").references(() => users.id),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------- 4. industries ---------- */
export const industries = pgTable("industries", {
  id: id(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  description: text("description"),
  managerId: uuid("manager_id").references(() => users.id),
  status: entityStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("industries_project_name_uq").on(t.projectId, t.name)]);

/* ---------- 5. contributors ---------- */
export const contributors = pgTable("contributors", {
  id: id(),
  code: varchar("code", { length: 20 }).notNull().unique(), // auto: CON-0001
  fullName: text("full_name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }),
  joiningDate: date("joining_date"),
  status: entityStatus("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ---------- 6. project_contributors (assignment = contributor x project x industry) ---------- */
export const projectContributors = pgTable("project_contributors", {
  id: id(),
  contributorId: uuid("contributor_id").notNull().references(() => contributors.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  industryId: uuid("industry_id").notNull().references(() => industries.id),
  dailyTargetHours: hours("daily_target_hours").notNull().default("8"),
  weeklyTargetHours: hours("weekly_target_hours").notNull().default("40"),
  monthlyTargetHours: hours("monthly_target_hours").notNull().default("160"),
  status: entityStatus("status").notNull().default("ACTIVE"),
  assignedFrom: date("assigned_from"),
  assignedTo: date("assigned_to"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("pc_unique_active").on(t.contributorId, t.projectId, t.industryId),
  index("pc_industry_idx").on(t.industryId),
]);

/* ---------- 7. daily_work_records (one row per assignment per day) ---------- */
export const dailyWorkRecords = pgTable("daily_work_records", {
  id: id(),
  assignmentId: uuid("assignment_id").notNull().references(() => projectContributors.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  industryId: uuid("industry_id").notNull().references(() => industries.id),
  contributorId: uuid("contributor_id").notNull().references(() => contributors.id),
  workDate: date("work_date").notNull(),
  targetHours: hours("target_hours").notNull(),
  actualHours: hours("actual_hours").notNull().default("0"),    // sum of sessions
  submittedHours: hours("submitted_hours").notNull().default("0"),
  remarks: text("remarks"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("dwr_assignment_date_uq").on(t.assignmentId, t.workDate),
  index("dwr_date_idx").on(t.workDate),
  index("dwr_industry_idx").on(t.industryId),
]);

/* ---------- 8. work_sessions (multiple sessions per day) ---------- */
export const workSessions = pgTable("work_sessions", {
  id: id(),
  dailyRecordId: uuid("daily_record_id").notNull().references(() => dailyWorkRecords.id),
  startTime: varchar("start_time", { length: 5 }), // HH:MM, optional
  endTime: varchar("end_time", { length: 5 }),
  hours: hours("hours").notNull(),
  note: text("note"),
  createdAt: createdAt(),
});

/* ---------- 9. acceptance_records ---------- */
export const acceptanceRecords = pgTable("acceptance_records", {
  id: id(),
  dailyRecordId: uuid("daily_record_id").notNull().references(() => dailyWorkRecords.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  industryId: uuid("industry_id").notNull().references(() => industries.id),
  contributorId: uuid("contributor_id").notNull().references(() => contributors.id),
  submissionDate: date("submission_date").notNull(),
  submittedHours: hours("submitted_hours").notNull(),
  acceptancePct: numeric("acceptance_pct", { precision: 7, scale: 4 }),   // null = pending
  acceptedHours: hours("accepted_hours").notNull().default("0"),
  rejectedHours: hours("rejected_hours").notNull().default("0"),
  qcStatus: qcStatus("qc_status").notNull().default("PENDING"),
  qcReference: text("qc_reference"),
  source: acceptanceSource("source").notNull().default("INDIVIDUAL"),
  allocationMethod: text("allocation_method"),
  statementId: uuid("statement_id"), // set when locked into a payment statement (prevents double billing)
  appliedRate: money("applied_rate"),            // frozen when locked into a statement
  payableAmount: numeric("payable_amount", { precision: 18, scale: 6 }), // exact accepted x rate, frozen when locked
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("acc_daily_uq").on(t.dailyRecordId),
  index("acc_industry_date_idx").on(t.industryId, t.submissionDate),
]);

/* ---------- 10. payment_rates (effective-dated, priority CONTRIBUTOR > INDUSTRY > PROJECT) ---------- */
export const paymentRates = pgTable("payment_rates", {
  id: id(),
  scope: rateScope("scope").notNull(),
  projectId: uuid("project_id").references(() => projects.id),
  industryId: uuid("industry_id").references(() => industries.id),
  assignmentId: uuid("assignment_id").references(() => projectContributors.id),
  hourlyRate: money("hourly_rate").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  effectiveFrom: date("effective_from").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [index("rates_lookup_idx").on(t.scope, t.projectId, t.industryId, t.assignmentId, t.effectiveFrom)]);

/* ---------- 11. industry_payment_statements ---------- */
export const industryPaymentStatements = pgTable("industry_payment_statements", {
  id: id(),
  code: varchar("code", { length: 24 }).notNull().unique(), // PAY-2026-0001
  projectId: uuid("project_id").notNull().references(() => projects.id),
  industryId: uuid("industry_id").notNull().references(() => industries.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalSubmittedHours: hours("total_submitted_hours").notNull().default("0"),
  totalAcceptedHours: hours("total_accepted_hours").notNull().default("0"),
  totalRejectedHours: hours("total_rejected_hours").notNull().default("0"),
  totalPendingHours: hours("total_pending_hours").notNull().default("0"),
  calculatedAmount: money("calculated_amount").notNull().default("0"),   // gross: accepted hours x rate
  tdsPercent: numeric("tds_percent", { precision: 5, scale: 2 }).notNull().default("0"), // frozen at creation (0 for statements made before TDS existed)
  tdsAmount: money("tds_amount").notNull().default("0"),                 // sum of per-line TDS, withheld from contributors
  adjustmentsTotal: money("adjustments_total").notNull().default("0"),
  approvedAmount: money("approved_amount").notNull().default("0"),
  paidAmount: money("paid_amount").notNull().default("0"),
  status: statementStatus("status").notNull().default("PENDING_APPROVAL"),
  lines: jsonb("lines").notNull().default(sql`'[]'::jsonb`), // frozen per-contributor breakdown
  remarks: text("remarks"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("stmt_industry_idx").on(t.industryId, t.periodStart, t.periodEnd)]);

/* ---------- 12. payment_transactions ---------- */
export const paymentTransactions = pgTable("payment_transactions", {
  id: id(),
  statementId: uuid("statement_id").notNull().references(() => industryPaymentStatements.id),
  amount: money("amount").notNull(),
  paymentDate: date("payment_date").notNull(),
  referenceNumber: varchar("reference_number", { length: 100 }).notNull(),
  method: varchar("method", { length: 30 }).notNull(), // BANK_TRANSFER, UPI, CHEQUE, CASH, OTHER
  remarks: text("remarks"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("txn_ref_uq").on(t.statementId, t.referenceNumber)]);

/* ---------- 13. payment_adjustments ---------- */
export const paymentAdjustments = pgTable("payment_adjustments", {
  id: id(),
  statementId: uuid("statement_id").notNull().references(() => industryPaymentStatements.id),
  amount: money("amount").notNull(), // signed: + bonus, - deduction
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ---------- 14. audit_logs ---------- */
export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 40 }).notNull(), // CREATE / UPDATE / DELETE / APPROVE / ...
  entity: varchar("entity", { length: 60 }).notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  note: text("note"),
  createdAt: createdAt(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)]);

/* ---------- 15. notifications ---------- */
export const notifications = pgTable("notifications", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/* ---------- sequences for auto IDs ---------- */
export const counters = pgTable("counters", {
  key: varchar("key", { length: 40 }).primaryKey(),
  value: integer("value").notNull().default(0),
});

/* ---------- contributor e-signatures (printed on payment acknowledgement slips) ---------- */
export const contributorSignatures = pgTable("contributor_signatures", {
  contributorId: uuid("contributor_id").primaryKey().references(() => contributors.id),
  mime: varchar("mime", { length: 20 }).notNull(),   // image/png | image/jpeg
  data: text("data").notNull(),                       // base64 (validated, max 400 KB)
  bytes: integer("bytes").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: updatedAt(),
});
