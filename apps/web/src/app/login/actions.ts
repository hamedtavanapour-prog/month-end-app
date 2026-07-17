"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { normalizeWorkspace, WORKSPACE_COOKIE } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function selectWorkspace(formData: FormData) {
  const workspace = String(formData.get("workspace") ?? "").trim();
  if (workspace.length < 2) redirect("/login?error=invalid_workspace");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_workspace", { p_identifier: workspace });
  const match = data?.[0];
  if (error || !match) redirect(`/login?error=workspace_not_found&workspaceQuery=${encodeURIComponent(workspace)}`);
  redirect(`/login?workspace=${encodeURIComponent(match.name)}`);
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

  const { data: memberships, error: membershipError } = await supabase.rpc("get_my_workspace_membership", { p_identifier: workspace });
  const membership = memberships?.[0];
  if (membershipError || !membership) {
    await supabase.auth.signOut();
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=workspace_access`);
  }

  if (membership.status === "suspended") {
    await supabase.auth.signOut();
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=account_suspended`);
  }
  if (membership.status !== "active") {
    await supabase.auth.signOut();
    redirect(`/login?workspace=${encodeURIComponent(workspace)}&error=workspace_access`);
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, normalizeWorkspace(membership.organization_slug || workspace), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  if (membership.must_change_password) redirect("/change-password");

  redirect(next);
}
