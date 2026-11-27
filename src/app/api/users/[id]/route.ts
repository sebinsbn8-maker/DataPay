import { z } from "zod";
import { handle, requirePermission } from "@/server/guard";
import { deleteUser, updateUser } from "@/server/users";

const patch = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(["ADMIN", "MANAGER", "CONTRIBUTOR"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10, "Password must be at least 10 characters").optional(),
  contributorId: z.string().uuid().nullable().optional(),
});

export const PATCH = (req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("users:manage");
  const { id } = await ctx.params;
  return updateUser(u.id, id, patch.parse(await req.json()));
});

export const DELETE = (_req: Request, ctx: { params: Promise<{ id: string }> }) => handle(async () => {
  const u = await requirePermission("users:manage");
  return deleteUser(u.id, (await ctx.params).id);
});
