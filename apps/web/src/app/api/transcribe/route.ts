import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const MAX_VOCABULARY_CHARS = 6000;

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
  if (declaredLength > MAX_REQUEST_BYTES) return json({ error: "Voice recording is too large." }, 413);

  const contentType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
  if (contentType !== "multipart/form-data") return json({ error: "Unsupported voice recording." }, 415);

  const submitted = await request.formData();
  const audio = submitted.get("audio");
  if (!(audio instanceof File) || !audio.size) return json({ error: "Voice recording is empty." }, 400);
  if (audio.size > MAX_AUDIO_BYTES) return json({ error: "Voice recording is too large." }, 413);
  if (!audio.type.startsWith("audio/")) return json({ error: "Unsupported voice recording." }, 415);
  const vocabulary = String(submitted.get("vocabulary") ?? "").replace(/[\r\n]+/g, " ").slice(0, MAX_VOCABULARY_CHARS);

  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "en");
  if (vocabulary) {
    form.append("prompt", `Restaurant beverage inventory count. Preserve product names and quantities. Product vocabulary: ${vocabulary}`);
  }
  form.append("file", audio, audio.name || "count-recording.webm");

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
