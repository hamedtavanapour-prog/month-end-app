import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // The legacy workspace is a public-file bundle hosted inside the authenticated
  // app shell. Its own API calls still pass through Proxy and authorize again,
  // but running an auth refresh for every HTML/CSS/JS asset makes a hard refresh
  // fan out into dozens of unnecessary Supabase checks.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|legacy(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
