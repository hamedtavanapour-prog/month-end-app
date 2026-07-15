"use server";

import { timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function matchesActivationToken(candidate: string) {
  const expected = process.env.OWNER_ACTIVATION_TOKEN;
  if (!expected) return false;

  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);

  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function activateOwner(formData: FormData) {
  const token = formData.get("token");
  const password = formData.get("password");
  const passwordConfirmation = formData.get("passwordConfirmation");

  if (typeof token !== "string" || !matchesActivationToken(token)) {
    redirect("/activate?error=invalid_link");
  }

  if (
    typeof password !== "string"
    || password.length < 12
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
  ) {
    redirect(`/activate?token=${encodeURIComponent(token)}&error=weak_password`);
  }

  if (password !== passwordConfirmation) {
    redirect(`/activate?token=${encodeURIComponent(token)}&error=password_mismatch`);
  }

  const email = process.env.INITIAL_OWNER_EMAIL?.trim().toLowerCase();
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");

  if (!email || !appUrl) {
    redirect(`/activate?token=${encodeURIComponent(token)}&error=setup_unavailable`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: "Hamed Tavanapour" },
      emailRedirectTo: `${appUrl}/auth/callback?next=/app`,
    },
  });

  if (error) {
    redirect(`/activate?token=${encodeURIComponent(token)}&error=activation_failed`);
  }

  redirect(`/activate?token=${encodeURIComponent(token)}&status=check_email`);
}
