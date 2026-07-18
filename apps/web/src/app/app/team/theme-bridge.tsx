"use client";

import { useEffect } from "react";

const THEMES = new Set(["slate", "graphite", "paper", "hospitality", "hospitality-light"]);

export function ThemeBridge() {
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "month-end-theme") return;
      const theme = String(event.data.theme || "");
      if (THEMES.has(theme)) document.documentElement.dataset.theme = theme;
      const tokens = event.data.tokens as Record<string, string> | undefined;
      if (tokens) {
        const root = document.documentElement.style;
        if (tokens.ink) root.setProperty("--ink", tokens.ink);
        if (tokens.muted) root.setProperty("--muted", tokens.muted);
        if (tokens.line) root.setProperty("--line", tokens.line);
        if (tokens.paper) root.setProperty("--paper", tokens.paper);
        if (tokens.canvas) root.setProperty("--canvas", tokens.canvas);
        if (tokens.accent) root.setProperty("--amber", tokens.accent);
        if (tokens.accentDark) root.setProperty("--amber-dark", tokens.accentDark);
        if (tokens.accentSoft) root.setProperty("--amber-soft", tokens.accentSoft);
        if (tokens.surface3) root.setProperty("--surface3", tokens.surface3);
        if (tokens.danger) root.setProperty("--danger", tokens.danger);
        if (tokens.success) root.setProperty("--green", tokens.success);
      }
    };
    window.addEventListener("message", receive);
    const reportHeight = () => window.parent?.postMessage({ type: "month-end-team-resize", height: document.documentElement.scrollHeight }, window.location.origin);
    const observer = new ResizeObserver(reportHeight);
    observer.observe(document.body);
    window.parent?.postMessage({ type: "month-end-theme-ready" }, window.location.origin);
    reportHeight();
    return () => { window.removeEventListener("message", receive); observer.disconnect(); };
  }, []);
  return null;
}
