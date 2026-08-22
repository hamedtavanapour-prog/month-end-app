import { describe, expect, it } from "vitest";

import { can, type AccessContext } from "./context";

function context(role: AccessContext["role"], permissionKeys: string[] = []): AccessContext {
  return {
    userId: "user-1",
    membershipId: "membership-1",
    organizationId: "restaurant-1",
    organizationName: "Restaurant One",
    organizationSlug: "restaurant-one",
    role,
    jobTitle: role,
    mustChangePassword: false,
    displayName: "Test User",
    email: "test@example.com",
    departmentIds: [],
    permissionKeys,
  };
}

describe("POS integration permissions", () => {
  it.each(["owner", "admin"] as const)("grants %s full integration access", (role) => {
    expect(can(context(role), "integrations.pos.manage")).toBe(true);
  });

  it("requires explicit integration access for managers and staff", () => {
    expect(can(context("manager"), "integrations.pos.view")).toBe(false);
    expect(can(context("staff"), "integrations.pos.view")).toBe(false);
    expect(can(context("manager", ["integrations.pos.view"]), "integrations.pos.view")).toBe(true);
  });
});
