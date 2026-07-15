"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";

import { sendInvitationSetupEmail } from "@/lib/auth/invitation-email";
import { createClient } from "@/lib/supabase/server";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendInvitationAccessEmail(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const tokenHash = hashToken(token);
  const supabase = await createClient();
  const { data: details } = await supabase.rpc("get_invitation_details", { p_token_hash: tokenHash });
  const invitation = details?.[0];

  if (!invitation || invitation.status !== "pending") redirect(`/invite/${token}?error=invalid_invitation`);
  const { error } = await sendInvitationSetupEmail({
    displayName: invitation.display_name,
    email: invitation.email,
    token,
  });

  if (error) redirect(`/invite/${token}?error=email_failed`);
  redirect(`/invite/${token}?status=check_email`);
}

export async function acceptInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_team_invitation", { p_token_hash: hashToken(token) });
  if (error) redirect(`/invite/${token}?error=accept_failed`);
  redirect("/app");
}

export async function finishEmailedInvitation(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const supabase = await createClient();
  const { data: details } = await supabase.rpc("get_invitation_details", { p_token_hash: hashToken(token) });
  const invitation = details?.[0];
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedInEmail = typeof claimsData?.claims?.email === "string" ? claimsData.claims.email.toLowerCase() : "";

  if (!invitation || invitation.status !== "pending" || invitation.email.toLowerCase() !== signedInEmail) {
    redirect(`/invite/${token}?error=accept_failed&ready=1`);
  }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    redirect(`/invite/${token}?error=weak_password&ready=1`);
  }
  if (password !== passwordConfirmation) redirect(`/invite/${token}?error=password_mismatch&ready=1`);

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect(`/invite/${token}?error=account_failed&ready=1`);

  const { error: acceptError } = await supabase.rpc("accept_team_invitation", { p_token_hash: hashToken(token) });
  if (acceptError) redirect(`/invite/${token}?error=accept_failed&ready=1`);

  await supabase.auth.signOut();
  redirect(`/login?status=account_ready&email=${encodeURIComponent(invitation.email)}`);
}
