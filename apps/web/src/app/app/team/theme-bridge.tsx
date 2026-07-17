"use client";

import { useEffect } from "react";

const THEMES = new Set(["slate", "graphite", "paper", "hospitality", "hospitality-light"]);

export function ThemeBridge() {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "month-end-theme") return;
      const theme = String(event.data.theme || "");
      if (THEMES.has(theme)) document.documentElement.dataset.theme = theme;
    };
    window.addEventListener("message", receive);
    window.parent?.postMessage({ type: "month-end-theme-ready" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);
  return null;
}
