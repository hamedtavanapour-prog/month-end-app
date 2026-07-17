import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "Voice transcription is not configured on this server." }, 503);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_AUDIO_BYTES) return json({ error: "Voice recording is too large." }, 413);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (!contentType.startsWith("audio/")) return json({ error: "Unsupported voice recording." }, 415);

  const audio = await request.arrayBuffer();
  if (!audio.byteLength) return json({ error: "Voice recording is empty." }, 400);
  if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "Voice recording is too large." }, 413);

  const extension = contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new File([audio], `count-recording.${extension}`, { type: contentType }));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string }; text?: string };
  if (!response.ok) {
    return json({ error: result.error?.message ?? "Voice transcription failed." }, response.status);
  }

  return json({ text: result.text ?? "" });
}
