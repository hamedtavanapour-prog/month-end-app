import type { Metadata } from "next";
import { requireAccessContext } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Workspace" };
export const dynamic = "force-dynamic";

export default async function AppHome() {
  const context = await requireAccessContext();

  return (
    <main className="legacy-host">
      <iframe
        allow="microphone"
        className="legacy-frame"
        src="/legacy/index.html?v=department-setup-1"
        title={`${context.organizationName} inventory workspace for ${context.email}`}
      />
    </main>
  );
}
