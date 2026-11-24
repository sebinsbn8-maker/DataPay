import { z } from "zod";
import { HttpError, handle, requirePermission } from "@/server/guard";
import { addAdjustment, approveStatement, recordPayment, voidStatement } from "@/server/payments";

// actions: approve | pay | adjust | void  (all require payments:approve = Admin only)
export const POST = (req: Request, ctx: { params: Promise<{ id: string; action: string }> }) => handle(async () => {
  const u = await requirePermission("payments:approve");
  const { id, action } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  switch (action) {
    case "approve": return approveStatement(u, id);
    case "pay": {
      const b = z.object({ amount: z.coerce.number().positive(), paymentDate: z.string(), referenceNumber: z.string().min(1), method: z.string().min(1), remarks: z.string().optional() }).parse(body);
      return recordPayment(u, id, b);
    }
    case "adjust": { const b = z.object({ amount: z.coerce.number(), reason: z.string().min(3) }).parse(body); return addAdjustment(u, id, b.amount, b.reason); }
    case "void": { const b = z.object({ reason: z.string().min(3), force: z.boolean().optional() }).parse(body); return voidStatement(u, id, b.reason, b.force); }
    default: throw new HttpError(404, "Unknown action");
  }
});
