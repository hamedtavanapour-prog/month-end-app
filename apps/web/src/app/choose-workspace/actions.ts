"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { WORKSPACE_COOKIE } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/app";
}

export async function chooseWorkspace(formData: FormData) {
  const membershipId = String(formData.get("membershipId") ?? "");
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, must_change_password, organizations(slug)")
    .eq("id", membershipId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const organization = Array.isArray(membership?.organizations)
    ? membership.organizations[0]
    : membership?.organizations;
  if (!membership || !organization?.slug) redirect("/choose-workspace?error=workspace_access");

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, organization.slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (membership.must_change_password) redirect("/change-password");
  redirect(next);
}
