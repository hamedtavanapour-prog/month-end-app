"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const requestedNext = formData.get("next");
  const next = typeof requestedNext === "string"
    && requestedNext.startsWith("/")
    && !requestedNext.startsWith("//")
    ? requestedNext
    : "/app";

  if (typeof email !== "string" || typeof password !== "string") {
    redirect("/login?error=invalid_form");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect(next);
}
