import Link from "next/link";

import { requireAccessContext } from "@/lib/auth/context";
import { defaultWorkspacePath } from "@/lib/workspace/routes";

export const metadata = { title: "Access required" };
export const dynamic = "force-dynamic";

export default async function ForbiddenPage() {
  const context = await requireAccessContext();
  const returnPath = defaultWorkspacePath(context);
  return (
    <main className="setup-page">
      <section className="setup-card">
        <span className="brand-mark">ME</span>
        <p className="eyebrow">Access required</p>
        <h1>This area isn&apos;t assigned to your account.</h1>
        <p>Ask a workspace administrator to update your access, or return to an area available to you.</p>
        <Link className="primary-link" href={returnPath === "/app/forbidden" ? "/login" : returnPath}>Return to workspace</Link>
      </section>
    </main>
  );
}
