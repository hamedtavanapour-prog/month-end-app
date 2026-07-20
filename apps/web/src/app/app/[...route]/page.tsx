import type { Metadata } from "next";
import Script from "next/script";
import { notFound, redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import {
  canAccessWorkspaceRoute,
  legacyDestinationQuery,
  resolveWorkspaceRoute,
  workspaceRouteAlias,
} from "@/lib/workspace/routes";
import { WorkspaceShell } from "../workspace-shell";

export const dynamic = "force-dynamic";

type WorkspacePageProps = {
  params: Promise<{ route: string[] }>;
};

export async function generateMetadata({ params }: WorkspacePageProps): Promise<Metadata> {
  const { route } = await params;
  const workspaceRoute = resolveWorkspaceRoute(route);
  return { title: workspaceRoute?.title ?? "Workspace" };
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { route } = await params;
  const alias = workspaceRouteAlias(route);
  if (alias) redirect(alias);

  const workspaceRoute = resolveWorkspaceRoute(route);
  if (!workspaceRoute) notFound();

  const context = await requireAccessContext();
  if (!canAccessWorkspaceRoute(context, workspaceRoute)) {
    redirect(`/app/forbidden?from=${encodeURIComponent(workspaceRoute.canonicalPath)}`);
  }

  return (
    <>
      <WorkspaceShell
        email={context.email}
        iframeQuery={legacyDestinationQuery(workspaceRoute.destination)}
        initialPath={workspaceRoute.canonicalPath}
        organizationName={context.organizationName}
        title={workspaceRoute.title}
      />
      <Script src="/legacy/js/search-bridge.js" strategy="afterInteractive" />
    </>
  );
}
