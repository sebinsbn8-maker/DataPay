import { handle, requirePermission, requireUser } from "@/server/guard";
import { createIndustry, listIndustries } from "@/server/masterdata";
import { industryInput } from "@/server/schemas";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => handle(async () => {
  const u = await requireUser(["ADMIN", "MANAGER"]);
  return listIndustries(u, new URL(req.url).searchParams.get("projectId"));
});
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("industries:write");
  return createIndustry(u, industryInput.parse(await req.json()));
});
