"use server";

import { redirect } from "next/navigation";

import { requireAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export async function completePasswordSetup(formData: FormData) {
  const context = await requireAccessContext({ allowPasswordChange: true });
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) redirect("/change-password?error=weak_password");
  if (password !== confirmation) redirect("/change-password?error=password_mismatch");

  const supabase = await createClient();
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) redirect("/change-password?error=update_failed");
  const { error: membershipError } = await supabase.rpc("complete_first_login", { p_membership_id: context.membershipId });
  if (membershipError) redirect("/change-password?error=update_failed");
  redirect("/app");
}
