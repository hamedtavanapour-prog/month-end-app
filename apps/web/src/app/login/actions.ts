"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { normalizeWorkspace, WORKSPACE_COOKIE, workspaceMatches } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function selectWorkspace(formData: FormData) {
  const workspace = String(formData.get("workspace") ?? "").trim();
  if (workspace.length < 2) redirect("/login?error=invalid_workspace");
  redirect(`/login?workspace=${encodeURIComponent(workspace)}`);
}

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const workspace = String(formData.get("workspace") ?? "").trim();
  const requestedNext = formData.get("next");
  const next = typeof requestedNext === "string"
    && requestedNext.startsWith("/")
    && !requestedNext.startsWith("//")
    ? requestedNext
    : "/app";

  if (typeof email !== "string" || typeof password !== "string" || !workspace) {
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=invalid_form`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=invalid_credentials`);
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const { data: memberships } = userId ? await supabase
    .from("memberships")
    .select("id, must_change_password, organizations(name, slug)")
    .eq("user_id", userId)
    .eq("status", "active") : { data: [] };
  const matching = (memberships ?? []).filter((membership) => {
    const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
    return organization ? workspaceMatches(workspace, organization) : false;
  });
  if (matching.length !== 1) {
    await supabase.auth.signOut();
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=workspace_access`);
  }

  const organization = Array.isArray(matching[0].organizations) ? matching[0].organizations[0] : matching[0].organizations;
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, normalizeWorkspace(organization?.slug || workspace), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (matching[0].must_change_password) redirect("/change-password");

  redirect(next);
}
