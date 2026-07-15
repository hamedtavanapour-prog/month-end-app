"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitedAccount(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const tokenHash = hashToken(token);
  const supabase = await createClient();
  const { data: details } = await supabase.rpc("get_invitation_details", { p_token_hash: tokenHash });
  const invitation = details?.[0];

  if (!invitation || invitation.status !== "pending") redirect(`/invite/${token}?error=invalid_invitation`);
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    redirect(`/invite/${token}?error=weak_password`);
  }
  if (password !== passwordConfirmation) redirect(`/invite/${token}?error=password_mismatch`);

  const appUrl = process.env.APP_URL?.replace(/\/$/, "") || "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email: invitation.email,
    password,
    options: {
      data: { display_name: invitation.display_name },
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(`/invite/${token}?ready=1`)}`,
    },
  });

  if (error) redirect(`/invite/${token}?error=account_failed`);
  if (data.session) {
    const { error: acceptError } = await supabase.rpc("accept_team_invitation", { p_token_hash: tokenHash });
    if (!acceptError) redirect("/app");
  }
  redirect(`/invite/${token}?status=check_email`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_team_invitation", { p_token_hash: hashToken(token) });
  if (error) redirect(`/invite/${token}?error=accept_failed`);
  redirect("/app");
}

