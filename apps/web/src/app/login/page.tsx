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
  confirmation_failed: "That verification link could not be completed. Please try signing in or request a new link.",
};

type LoginPageProps = {
  searchParams: Promise<{ email?: string; error?: string; next?: string; reset?: string; status?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/app");

  const params = await searchParams;
  const errorMessage = params.error ? errors[params.error] : null;
  const next = params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/app";

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Keg Bar introduction">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">🍺</span>
          <span>Keg Bar</span>
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
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p className="muted">Use the account provided by your manager.</p>
          </div>

          {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}
          {params.reset ? <div className="success-alert">Your password has been updated. Sign in to continue.</div> : null}
          {params.status === "account_ready" ? <div className="success-alert">Your account is ready. Sign in with your new password.</div> : null}

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
            <span>Your administrator or department manager can send you a private invitation.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
