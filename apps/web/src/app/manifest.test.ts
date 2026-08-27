import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("web app manifest", () => {
  it("keeps every same-origin route inside the installed app", () => {
    expect(manifest()).toMatchObject({
      id: "/app",
      start_url: "/app",
      scope: "/",
      display: "standalone",
    });
  });
});
