import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optDate = dateStr.optional().nullable().or(z.literal("").transform(() => null));
const num = z.coerce.number().finite().nonnegative();

export const projectInput = z.object({
  name: z.string().trim().min(2),
  clientName: z.string().trim().min(1),
  description: z.string().optional().nullable(),
  startDate: optDate, endDate: optDate,
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).default("ACTIVE"),
  managerId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  notes: z.string().optional().nullable(),
}).refine((p) => !p.startDate || !p.endDate || p.endDate >= p.startDate, { message: "End date must be after start date", path: ["endDate"] });

export const industryInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2),
  description: z.string().optional().nullable(),
  managerId: z.string().uuid().optional().nullable().or(z.literal("").transform(() => null)),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

export const contributorInput = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().optional().nullable(),
  joiningDate: optDate,
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  notes: z.string().optional().nullable(),
});

export const assignmentInput = z.object({
  contributorId: z.string().uuid(),
  projectId: z.string().uuid(),
  industryId: z.string().uuid(),
  dailyTargetHours: num.default(8),
  weeklyTargetHours: num.default(40),
  monthlyTargetHours: num.default(160),
  hourlyRate: num.optional(), // convenience: creates a CONTRIBUTOR-scope rate effective today
  assignedFrom: optDate,
});

export const rateInput = z.object({
  scope: z.enum(["PROJECT", "INDUSTRY", "CONTRIBUTOR"]),
  projectId: z.string().uuid().optional().nullable(),
  industryId: z.string().uuid().optional().nullable(),
  assignmentId: z.string().uuid().optional().nullable(),
  hourlyRate: z.coerce.number().positive(),
  effectiveFrom: dateStr,
}).superRefine((r, ctx) => {
  const need = { PROJECT: r.projectId, INDUSTRY: r.industryId, CONTRIBUTOR: r.assignmentId }[r.scope];
  if (!need) ctx.addIssue({ code: "custom", message: `A ${r.scope.toLowerCase()} must be selected for ${r.scope} rates`, path: [r.scope === "PROJECT" ? "projectId" : r.scope === "INDUSTRY" ? "industryId" : "assignmentId"] });
});

export const userInput = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["ADMIN", "MANAGER", "CONTRIBUTOR"]),
  password: z.string().min(10, "Password must be at least 10 characters").optional(),
  contributorId: z.string().uuid().optional().nullable(),
  isActive: z.boolean().default(true),
});
export const today = () => new Date().toISOString().slice(0, 10);
