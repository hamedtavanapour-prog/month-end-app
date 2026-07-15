import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { activateOwner } from "./actions";

export const metadata: Metadata = { title: "Activate owner account" };
export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  invalid_link: "This activation link is not valid.",
  weak_password: "Use at least 12 characters, including uppercase, lowercase, and a number.",
  password_mismatch: "The two passwords do not match.",
  setup_unavailable: "Owner setup is temporarily unavailable.",
  activation_failed: "We could not start activation. Please try again.",
};

type ActivatePageProps = {
  searchParams: Promise<{ error?: string; status?: string; token?: string }>;
};

export default async function ActivatePage({ searchParams }: ActivatePageProps) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/app");

  const params = await searchParams;
  const expectedToken = process.env.OWNER_ACTIVATION_TOKEN;
  const tokenIsValid = Boolean(expectedToken && params.token === expectedToken);
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  const errorMessage = params.error ? errors[params.error] : null;

  return (
    <main className="setup-page">
      <section className="setup-card activation-card">
        <span className="brand-mark" aria-hidden="true">M</span>

        {params.status === "check_email" ? (
          <>
            <p className="eyebrow">One last step</p>
            <h1>Check your email.</h1>
            <p>
              We sent a verification link to <strong>{ownerEmail}</strong>. Open it,
              then sign in with the password you just chose.
            </p>
            <Link className="primary-link" href="/login">Go to sign in</Link>
          </>
        ) : tokenIsValid ? (
          <>
            <p className="eyebrow">First owner setup</p>
            <h1>Create your Owner account.</h1>
            <p>
              This account will own the Keg Bar workspace and can later invite
              managers and staff.
            </p>

            {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}

            <form action={activateOwner} className="auth-form activation-form">
              <input name="token" type="hidden" value={params.token} />
              <label>
                <span>Email address</span>
                <input type="email" value={ownerEmail} disabled />
              </label>
              <label>
                <span>Choose a password</span>
                <input name="password" type="password" autoComplete="new-password" minLength={12} required />
                <small>At least 12 characters with uppercase, lowercase, and a number.</small>
              </label>
              <label>
                <span>Confirm password</span>
                <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={12} required />
              </label>
              <button type="submit">Create Owner account</button>
            </form>
          </>
        ) : (
          <>
            <p className="eyebrow">Private setup</p>
            <h1>Use your personal activation link.</h1>
            <p>The Owner account can only be created from the private link issued during setup.</p>
            {errorMessage ? <div className="form-alert" role="alert">{errorMessage}</div> : null}
            <Link className="secondary-link" href="/login">Back to sign in</Link>
          </>
        )}
      </section>
    </main>
  );
}
