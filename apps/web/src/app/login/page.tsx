import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid_form: "Enter your email address and password.",
  invalid_credentials: "That email address or password is not correct.",
  workspace_access: "This account does not have access to an active customer workspace.",
  account_suspended: "Your account has been suspended. Contact your manager or administrator for help.",
  confirmation_failed: "That verification link could not be completed. Please try signing in or request a new link.",
};

type LoginPageProps = {
  searchParams: Promise<{ email?: string; error?: string; next?: string; reset?: string; status?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const params = await searchParams;
  if (data?.claims) redirect("/choose-workspace");
  const errorMessage = params.error ? errors[params.error] : null;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/app";

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Month's End introduction">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">ME</span>
          <span>Month&apos;s End</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">Inventory Manager</p>
          <h1>Your bar, kitchen, and supplies—properly counted.</h1>
          <p>
            One secure workspace for bar, kitchen, office, and every department
            your operation needs.
          </p>
        </div>
        <p className="story-footnote">Private accounts · Department access · Fully traceable</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div><p className="eyebrow">Welcome back</p><h2>Sign in to Month&apos;s End</h2><p className="muted">Use your individual account. We will open the locations assigned to you.</p></div>

          {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}
          {params.reset ? <div className="success-alert">Your password has been updated. Sign in to continue.</div> : null}
          {params.status === "account_ready" ? <div className="success-alert">Your account is ready. Sign in with your new password.</div> : null}
          {params.status === "prepared" ? <div className="success-alert">Your account is ready. Sign in with the temporary password from your manager.</div> : null}

          <form action={login} className="auth-form">
            <input name="next" type="hidden" value={next} />
            <label>
              <span>Email address</span>
              <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <div className="password-help"><Link href="/forgot-password">Forgot password?</Link></div>
            <button type="submit">Sign in</button>
          </form>

          <div className="login-help">
            <p>Need an account?</p>
            <span>Your administrator or manager can prepare one for you.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
