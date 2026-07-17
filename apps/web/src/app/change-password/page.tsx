import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import { completePasswordSetup } from "./actions";

export const metadata: Metadata = { title: "Set your password" };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  weak_password: "Use at least 12 characters with uppercase, lowercase, and a number.",
  password_mismatch: "The passwords do not match.",
  update_failed: "Your password could not be updated. Please try again.",
};

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const context = await requireAccessContext({ allowPasswordChange: true });
  if (!context.mustChangePassword) redirect("/app");
  const params = await searchParams;
  return <main className="setup-page"><section className="setup-card password-setup-card">
    <span className="brand-mark" aria-hidden="true">ME</span>
    <p className="eyebrow">First sign in</p>
    <h1>Create your private password.</h1>
    <p>{context.displayName}, replace the temporary password before opening {context.organizationName}.</p>
    {params.error ? <div className="form-alert" role="alert">{errors[params.error] ?? errors.update_failed}</div> : null}
    <form action={completePasswordSetup} className="auth-form">
      <label><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={12} required /></label>
      <label><span>Confirm password</span><input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required /></label>
      <button type="submit">Save password and continue</button>
    </form>
  </section></main>;
}
