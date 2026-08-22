import { describe, expect, it } from "vitest";

import { planTicketIngestion } from "./ingestion";

describe("ticket ingestion planning", () => {
  it("classifies new, updated, and unchanged external tickets", () => {
    const plan = planTicketIngestion([
      { externalId: "new", contentHash: "n1", value: "new ticket" },
      { externalId: "updated", contentHash: "u2", value: "updated ticket" },
      { externalId: "same", contentHash: "s1", value: "same ticket" },
    ], [
      { externalId: "updated", contentHash: "u1" },
      { externalId: "same", contentHash: "s1" },
    ]);

    expect(plan.created.map((ticket) => ticket.externalId)).toEqual(["new"]);
    expect(plan.updated.map((ticket) => ticket.externalId)).toEqual(["updated"]);
    expect(plan.skipped.map((ticket) => ticket.externalId)).toEqual(["same"]);
  });

  it("reports duplicate external IDs before database writes", () => {
    const plan = planTicketIngestion([
      { externalId: "duplicate", contentHash: "v1", value: 1 },
      { externalId: "duplicate", contentHash: "v2", value: 2 },
    ], []);

    expect(plan.duplicateExternalIds).toEqual(["duplicate"]);
    expect(plan.unique).toHaveLength(1);
  });
});
