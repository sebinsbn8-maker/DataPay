import { handle, requireUser } from "@/server/guard";
import { mySlips } from "@/server/slip";

export const dynamic = "force-dynamic";
export const GET = () => handle(async () => mySlips(await requireUser(["CONTRIBUTOR"])));
