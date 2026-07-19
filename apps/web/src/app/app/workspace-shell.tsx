"use client";

import { useEffect, useRef } from "react";

type WorkspaceShellProps = {
  email: string;
  iframeQuery: string;
  initialPath: string;
  organizationName: string;
  title: string;
};

type RouteMessage = {
  type?: string;
  path?: string;
  title?: string;
  replace?: boolean;
};

export function WorkspaceShell({ email, iframeQuery, initialPath, organizationName, title }: WorkspaceShellProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const currentPathRef = useRef(initialPath);

  useEffect(() => {
    document.title = `${title} · Month End`;

    function sendCurrentRoute() {
      const path = `${window.location.pathname}${window.location.search}`;
      if (!path.startsWith("/app/")) return;
      currentPathRef.current = path;
      frameRef.current?.contentWindow?.postMessage({ type: "month-end:apply-route", path }, window.location.origin);
    }

    function receiveRoute(event: MessageEvent<RouteMessage>) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type !== "month-end:route-change" || !event.data.path?.startsWith("/app/")) return;
      const nextPath = event.data.path;
      if (nextPath !== currentPathRef.current) {
        window.history[event.data.replace ? "replaceState" : "pushState"]({ monthEndRoute: true }, "", nextPath);
        currentPathRef.current = nextPath;
      }
      if (event.data.title) document.title = `${event.data.title} · Month End`;
    }

    window.addEventListener("message", receiveRoute);
    window.addEventListener("popstate", sendCurrentRoute);
    return () => {
      window.removeEventListener("message", receiveRoute);
      window.removeEventListener("popstate", sendCurrentRoute);
    };
  }, [title]);

  return (
    <main className="legacy-host">
      <iframe
        allow="microphone"
        className="legacy-frame"
        onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "month-end:apply-route", path: initialPath }, window.location.origin)}
        ref={frameRef}
        src={`/legacy/index.html?${iframeQuery}`}
        title={`${organizationName} inventory workspace for ${email}`}
      />
    </main>
  );
}
