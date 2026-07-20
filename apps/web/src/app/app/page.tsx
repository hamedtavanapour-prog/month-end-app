import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import { defaultWorkspacePath } from "@/lib/workspace/routes";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const context = await requireAccessContext();
  redirect(defaultWorkspacePath(context));
}
