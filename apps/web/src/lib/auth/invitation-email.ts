import "server-only";

import { createClient as createAuthClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { getPublicAppUrl } from "./public-url";

type InvitationEmail = {
  displayName: string;
  email: string;
  token: string;
};

export async function sendInvitationSetupEmail({ displayName, email, token }: InvitationEmail) {
  const { url, publishableKey } = getSupabaseEnv();
  const invitationMailer = createAuthClient(url, publishableKey, {
    auth: {
      flowType: "implicit",
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return invitationMailer.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { display_name: displayName },
      // Implicit auth tokens arrive in the URL fragment, so the browser must
      // land directly on the client-side invitation session bridge.
      emailRedirectTo: `${getPublicAppUrl()}/invite/${encodeURIComponent(token)}?ready=1`,
    },
  });
}
