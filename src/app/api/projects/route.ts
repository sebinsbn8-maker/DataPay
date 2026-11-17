import { handle, requirePermission, requireUser } from "@/server/guard";
import { createProject, listProjects } from "@/server/masterdata";
import { projectInput } from "@/server/schemas";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => listProjects(await requireUser(["ADMIN", "MANAGER"])));
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("projects:write");
  return createProject(u, projectInput.parse(await req.json()));
});
