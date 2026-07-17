import type { Metadata } from "next";
import Link from "next/link";

import { requestPasswordReset } from "./actions";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card activation-card">
    <span className="brand-mark" aria-hidden="true">ME</span>
    {params.sent ? <><p className="eyebrow">Email sent</p><h1>Check your inbox.</h1><p>If an account exists for that address, a secure password-reset link is on its way.</p><Link className="secondary-link" href="/login">Back to sign in</Link></> : <>
      <p className="eyebrow">Account recovery</p><h1>Reset your password.</h1><p>Enter the email address you use for Keg Bar Inventory.</p>
      {params.error ? <div className="form-alert">Enter a valid email address.</div> : null}
      <form action={requestPasswordReset} className="auth-form activation-form"><label><span>Email address</span><input name="email" type="email" autoComplete="email" required /></label><button type="submit">Send reset link</button></form>
      <Link className="secondary-link" href="/login">Back to sign in</Link>
    </>}
  </section></main>;
}
