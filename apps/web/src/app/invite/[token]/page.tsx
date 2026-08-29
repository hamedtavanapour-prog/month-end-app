import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { acceptInvitation, finishEmailedInvitation, sendInvitationAccessEmail } from "./actions";
import { InviteSessionBridge } from "./invite-session-bridge";
import { createHash } from "node:crypto";

export const metadata: Metadata = { title: "Join Month's End" };
export const dynamic = "force-dynamic";

type InvitePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; status?: string; ready?: string }>;
};

const errors: Record<string, string> = {
  invalid_invitation: "This invitation is no longer available.",
  weak_password: "Use at least 12 characters, including uppercase, lowercase, and a number.",
  password_mismatch: "The two passwords do not match.",
  account_failed: "An account already exists for this email, or signup could not be completed. Sign in and return to this invitation.",
  accept_failed: "This invitation does not match the signed-in account.",
  email_failed: "The secure setup email could not be sent. Please wait a moment and try again.",
};

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [{ data: details }, { data: claimsData }] = await Promise.all([
    supabase.rpc("get_invitation_details", { p_token_hash: tokenHash }),
    supabase.auth.getClaims(),
  ]);
  const invitation = details?.[0];
  const signedIn = Boolean(claimsData?.claims);
  const unavailable = !invitation || invitation.status !== "pending";

  return (
    <main className="login-page invite-page">
      <InviteSessionBridge />
      <section className="login-story" aria-label="Month's End invitation">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">ME</span><span>Month&apos;s End</span></div>
        <div className="story-copy"><p className="eyebrow">Team invitation</p><h1>You’re joining one shared operation.</h1><p>Your work will be saved under your own account, with access limited to the departments and actions assigned to you.</p></div>
        <p className="story-footnote">Individual login · Department access · Activity history</p>
      </section>
      <section className="login-panel"><div className="login-card invite-card">
        {unavailable ? <><p className="eyebrow">Invitation unavailable</p><h2>This link cannot be used.</h2><p className="muted">It may have expired, been revoked, or already been accepted.</p><Link className="secondary-link" href="/login">Go to sign in</Link></> : query.status === "check_email" ? <>
          <p className="eyebrow">Check your email</p><h2>Confirm your account.</h2><p className="muted">We sent a secure verification link to <strong>{invitation.email}</strong>. Open it to return here and finish joining {invitation.organization_name}.</p>
        </> : signedIn && query.ready ? <>
          <p className="eyebrow">Email confirmed</p><h2>Finish joining {invitation.organization_name}</h2><p className="muted">Choose the password you will use for future sign-ins. Your {invitation.role} access will be applied immediately.</p>
          {query.error ? <div className="form-alert" role="alert">{errors[query.error]}</div> : null}
          <form action={finishEmailedInvitation} className="auth-form">
            <input name="token" type="hidden" value={token} />
            <label><span>Choose a password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /><small>At least 12 characters with uppercase, lowercase, and a number.</small></label>
            <label><span>Confirm password</span><input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
            <button type="submit">Set password and join</button>
          </form>
        </> : signedIn ? <>
          <p className="eyebrow">Signed in</p><h2>Accept your invitation</h2><p className="muted">Continue only if you are signed in as <strong>{invitation.email}</strong>.</p>
          {query.error ? <div className="form-alert" role="alert">{errors[query.error]}</div> : null}
          <form action={acceptInvitation} className="auth-form"><input name="token" type="hidden" value={token} /><button type="submit">Accept and enter workspace</button></form>
        </> : <>
          <p className="eyebrow">Invited to {invitation.organization_name}</p><h2>Welcome, {invitation.display_name}</h2><p className="muted">Verify <strong>{invitation.email}</strong> using a secure email link. You will then choose your password and activate your <strong>{invitation.role}</strong> access. This invitation expires {new Date(invitation.expires_at).toLocaleDateString("en-CA")}.</p>
          {query.error ? <div className="form-alert" role="alert">{errors[query.error]}</div> : null}
          <form action={sendInvitationAccessEmail} className="auth-form">
            <input name="token" type="hidden" value={token} />
            <label><span>Email address</span><input type="email" value={invitation.email} disabled /></label>
            <button type="submit">Send secure setup email</button>
          </form>
          <div className="login-help"><p>Already have an account?</p><Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept this invitation</Link></div>
        </>}
      </div></section>
    </main>
  );
}
