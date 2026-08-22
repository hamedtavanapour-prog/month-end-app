import { NextResponse } from "next/server";

import { createPosProvider } from "@/lib/pos/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 1_000_000;

export async function POST(request: Request) {
  const configured = Boolean(
    process.env.OMNIVORE_API_KEY
    && process.env.OMNIVORE_API_BASE_URL
    && process.env.OMNIVORE_LOCATION_ID,
  );
  if (!configured) {
    return NextResponse.json(
      { error: "Omnivore webhook processing is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: "Webhook payload is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json(
      { error: "Webhook payload is too large." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const adapter = createPosProvider("omnivore", "live");
  const verified = adapter.verifyWebhook
    ? await adapter.verifyWebhook(rawBody, request.headers)
    : false;

  if (!verified) {
    return NextResponse.json(
      { error: "Omnivore webhook verification is not enabled until the authorized verification contract is confirmed." },
      { status: 501, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { error: "Verified Omnivore event processing is not enabled." },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
