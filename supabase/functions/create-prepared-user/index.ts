import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.5";

const headers = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

  const body = await request.json().catch(() => null) as {
    organizationId?: string; email?: string; displayName?: string; temporaryPassword?: string;
    role?: string; jobTitle?: string; departmentIds?: string[]; permissionKeys?: string[]; loginUrl?: string;
  } | null;
  if (!body?.organizationId || !body.email || !body.displayName || !body.temporaryPassword || !body.jobTitle || !body.loginUrl) return json({ error: "Invalid account" }, 400);
  if (body.temporaryPassword.length < 12 || !body.email.includes("@")) return json({ error: "Invalid account" }, 400);
  const loginUrl = new URL(body.loginUrl);
  if (loginUrl.protocol !== "https:" && !(loginUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(loginUrl.hostname))) return json({ error: "Invalid login URL" }, 400);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await caller.auth.getUser();
  if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = body.email.trim().toLowerCase();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: body.temporaryPassword,
    email_confirm: true,
    user_metadata: { display_name: body.displayName.trim() },
  });
  if (createError || !created.user) return json({ error: "account_exists" }, 409);

  const { error: membershipError } = await caller.rpc("provision_team_member", {
    p_organization_id: body.organizationId,
    p_user_id: created.user.id,
    p_email: email,
    p_display_name: body.displayName.trim(),
    p_role: body.role || "staff",
    p_job_title: body.jobTitle.trim(),
    p_department_ids: body.departmentIds || [],
    p_permission_keys: body.permissionKeys || [],
    p_must_change_password: true,
  });
  if (membershipError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: membershipError.message }, 403);
  }

  const { error: emailError } = await caller.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: body.loginUrl },
  });
  return json({ created: true, emailDelivered: !emailError });
});
