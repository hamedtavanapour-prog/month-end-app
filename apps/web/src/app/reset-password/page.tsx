import type { Metadata } from "next";

import { updatePassword } from "./actions";

export const metadata: Metadata = { title: "Choose a new password" };

const messages: Record<string, string> = {
  weak_password: "Use at least 12 characters, including uppercase, lowercase, and a number.",
  password_mismatch: "The two passwords do not match.",
  update_failed: "Your password could not be updated. Request a new reset link.",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card activation-card">
    <span className="brand-mark" aria-hidden="true">🍺</span><p className="eyebrow">Account recovery</p><h1>Choose a new password.</h1><p>Use a unique password that you do not use for another service.</p>
    {params.error ? <div className="form-alert">{messages[params.error]}</div> : null}
    <form action={updatePassword} className="auth-form activation-form"><label><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label><label><span>Confirm new password</span><input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label><button type="submit">Update password</button></form>
  </section></main>;
}

