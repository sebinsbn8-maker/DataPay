import { handle, requirePermission, requireUser } from "@/server/guard";
import { createContributor, listContributors } from "@/server/masterdata";
import { contributorInput } from "@/server/schemas";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => listContributors(await requireUser(["ADMIN", "MANAGER"])));
export const POST = (req: Request) => handle(async () => {
  const u = await requirePermission("contributors:write");
  return createContributor(u, contributorInput.parse(await req.json()));
});
