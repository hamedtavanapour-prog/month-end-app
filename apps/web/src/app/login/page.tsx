import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { login, selectWorkspace } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid_form: "Enter your email address and password.",
  invalid_credentials: "That email address or password is not correct.",
  invalid_workspace: "Enter the restaurant or workspace name.",
  workspace_not_found: "We couldn’t find that restaurant or workspace. Check the name and try again.",
  workspace_access: "This account does not have access to that restaurant.",
  account_suspended: "Your account has been suspended. Contact your manager or administrator for help.",
  confirmation_failed: "That verification link could not be completed. Please try signing in or request a new link.",
};

type LoginPageProps = {
  searchParams: Promise<{ email?: string; error?: string; next?: string; reset?: string; status?: string; workspace?: string; workspaceQuery?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const params = await searchParams;
  if (data?.claims && !params.workspace) redirect("/app");
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
          <div><p className="eyebrow">Welcome back</p><h2>{params.workspace ? params.workspace : "Find your restaurant"}</h2><p className="muted">{params.workspace ? "Use the account provided by your manager." : "Enter your restaurant or workspace name first."}</p></div>

          {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}
          {params.reset ? <div className="success-alert">Your password has been updated. Sign in to continue.</div> : null}
          {params.status === "account_ready" ? <div className="success-alert">Your account is ready. Sign in with your new password.</div> : null}
          {params.status === "prepared" ? <div className="success-alert">Your account is ready. Sign in with the temporary password from your manager.</div> : null}

          {!params.workspace ? <form action={selectWorkspace} className="auth-form">
            <label><span>Restaurant or workspace</span><input name="workspace" autoCapitalize="words" autoComplete="organization" defaultValue={params.workspaceQuery ?? ""} placeholder="e.g. The Keg" required /></label>
            <button type="submit">Continue</button>
          </form> : <form action={login} className="auth-form">
            <input name="next" type="hidden" value={next} />
            <input name="workspace" type="hidden" value={params.workspace} />
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
            <Link className="auth-switch-workspace" href="/login">Use a different restaurant</Link>
          </form>}

          <div className="login-help">
            <p>Need an account?</p>
            <span>Your administrator or manager can prepare one for you.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
