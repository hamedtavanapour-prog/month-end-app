"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

export function InviteSessionBridge() {
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!accessToken || !refreshToken) return;

    void createClient().auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).then(({ error }) => {
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState({}, "", cleanUrl);
      window.location.replace(error ? "/login?error=confirmation_failed" : cleanUrl);
    });
  }, []);

  return null;
}
