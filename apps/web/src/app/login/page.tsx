import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { login } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid_form: "Enter your email address and password.",
  invalid_credentials: "That email address or password is not correct.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/app");

  const params = await searchParams;
  const errorMessage = params.error ? errors[params.error] : null;

  return (
    <main className="login-page">
      <section className="login-story" aria-label="Month End introduction">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Month End</span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">Inventory operations</p>
          <h1>Every count, order, and report—properly accounted for.</h1>
          <p>
            One secure workspace for bar, kitchen, office, and every department
            your operation needs.
          </p>
        </div>
        <p className="story-footnote">Private by default · Department-aware · Fully traceable</p>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>Sign in to your workspace</h2>
            <p className="muted">Use the account provided by your manager.</p>
          </div>

          {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}

          <form action={login} className="auth-form">
            <label>
              <span>Email address</span>
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              <span>Password</span>
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit">Sign in</button>
          </form>

          <div className="login-help">
            <p>Need an account?</p>
            <span>Your administrator or department manager can invite you.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
