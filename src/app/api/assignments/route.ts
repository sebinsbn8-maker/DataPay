import { handle, requirePermission } from "@/server/guard";
import { createAssignment } from "@/server/masterdata";
import { assignmentInput } from "@/server/schemas";

export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("contributors:write");
  return createAssignment(u, assignmentInput.parse(await req.json()));
});
