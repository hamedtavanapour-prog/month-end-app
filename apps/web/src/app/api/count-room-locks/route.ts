import { NextResponse } from "next/server";

import { can, getAccessContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ID_LIMIT = 100;

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function cleanId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= ID_LIMIT
    ? value.trim()
    : null;
}

async function requestContext() {
  const context = await getAccessContext();
  if (!context) return { error: response({ error: "No active workspace" }, 403) } as const;
  if (!can(context, "counts.create")) {
    return { error: response({ error: "You do not have permission to work on counts" }, 403) } as const;
  }
  return { context, supabase: await createClient() } as const;
}

export async function GET(request: Request) {
  const result = await requestContext();
  if ("error" in result) return result.error;
  const countId = cleanId(new URL(request.url).searchParams.get("countId"));
  if (!countId) return response({ error: "A count is required" }, 400);

  const { data, error } = await result.supabase
    .from("count_room_locks")
    .select("count_id, room_id, user_id, holder_name, expires_at")
    .eq("organization_id", result.context.organizationId)
    .eq("count_id", countId)
    .gt("expires_at", new Date().toISOString());
  if (error) return response({ error: "Could not load room availability" }, 500);

  return response({
    locks: (data ?? []).map((lock) => ({
      countId: lock.count_id,
      roomId: lock.room_id,
      userId: lock.user_id,
      holderName: lock.holder_name,
      expiresAt: lock.expires_at,
      mine: lock.user_id === result.context.userId,
    })),
  });
}

export async function POST(request: Request) {
  const result = await requestContext();
  if ("error" in result) return result.error;
  let body: { countId?: unknown; roomId?: unknown };
  try {
    body = await request.json() as { countId?: unknown; roomId?: unknown };
  } catch {
    return response({ error: "Invalid room reservation" }, 400);
  }
  const countId = cleanId(body.countId);
  const roomId = cleanId(body.roomId);
  if (!countId || !roomId) return response({ error: "A count and room are required" }, 400);

  const { data, error } = await result.supabase.rpc("acquire_count_room_lock", {
    p_organization_id: result.context.organizationId,
    p_count_id: countId,
    p_room_id: roomId,
  });
  if (error) {
    const missing = error.message.includes("count_room_not_found");
    return response({ error: missing ? "That count room no longer exists" : "Could not reserve this room" }, missing ? 404 : 500);
  }
  const lock = data?.[0];
  if (!lock) return response({ error: "Could not reserve this room" }, 500);

  return response({
    acquired: lock.acquired,
    lock: {
      countId,
      roomId,
      userId: lock.user_id,
      holderName: lock.holder_name,
      expiresAt: lock.expires_at,
      mine: lock.user_id === result.context.userId,
    },
  }, lock.acquired ? 200 : 409);
}

export async function DELETE(request: Request) {
  const result = await requestContext();
  if ("error" in result) return result.error;
  let body: { countId?: unknown; roomId?: unknown };
  try {
    body = await request.json() as { countId?: unknown; roomId?: unknown };
  } catch {
    return response({ error: "Invalid room release" }, 400);
  }
  const countId = cleanId(body.countId);
  const roomId = cleanId(body.roomId);
  if (!countId || !roomId) return response({ error: "A count and room are required" }, 400);

  const { error } = await result.supabase.rpc("release_count_room_lock", {
    p_organization_id: result.context.organizationId,
    p_count_id: countId,
    p_room_id: roomId,
  });
  if (error) return response({ error: "Could not release this room" }, 500);
  return response({ released: true });
}
