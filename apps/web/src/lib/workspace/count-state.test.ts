import { describe, expect, it } from "vitest";

import {
  createCountDraftInWorkspace,
  deleteCountFromWorkspace,
  saveCountRoomInWorkspace,
  setCountArchivedInWorkspace,
} from "./count-state";
import type { Json } from "@/types/database";

const actor = { id: "user-1", name: "Alex Manager", role: "Manager" };

function workspaceWithCount(): { products: Json[]; inventories: Json[] } {
  return {
    products: [{ id: "product-1", archived: false }, { id: "product-2", archived: false }],
    inventories: [{
      id: "count-1",
      date: "2026-08-22",
      label: "August Count",
      recordType: "count",
      status: "saved",
      finalised: false,
      items: { "product-1": 2 },
      rooms: [{ id: "room-entry-1", roomId: "room-1", name: "Main Bar", items: { "product-1": 2 }, extraProductIds: [] }],
    }],
  };
}

describe("count change history", () => {
  it("adds a creation event to a new count", () => {
    const result = createCountDraftInWorkspace({ inventories: [] }, {
      id: "count-1",
      date: "2026-08-22",
      label: "August Count",
      recordType: "count",
      createdBy: actor,
    });
    const count = (result.inventories as Array<Record<string, unknown>>)[0];
    expect(count.history).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "created", actor: expect.objectContaining({ name: "Alex Manager" }) }),
    ]));
  });

  it("records each changed room quantity and its actor", () => {
    const result = saveCountRoomInWorkspace(
      workspaceWithCount(),
      "count-1",
      "room-entry-1",
      { "product-1": 4, "product-2": 1 },
      [],
      actor,
    );
    const count = (result.inventories as Array<Record<string, unknown>>)[0];
    expect(count.history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "room_saved",
        actor: expect.objectContaining({ id: "user-1", name: "Alex Manager" }),
        details: expect.objectContaining({
          roomName: "Main Bar",
          changes: expect.arrayContaining([
            { productId: "product-1", before: 2, after: 4 },
            { productId: "product-2", before: null, after: 1 },
          ]),
        }),
      }),
    ]));
  });

  it("records archive and restore events", () => {
    const archived = setCountArchivedInWorkspace(workspaceWithCount(), "count-1", true, actor);
    const restored = setCountArchivedInWorkspace(archived, "count-1", false, actor);
    const count = (restored.inventories as Array<Record<string, unknown>>)[0];
    expect(count.archived).toBe(false);
    expect((count.history as Array<{ action: string }>).map((event) => event.action)).toEqual(["archived", "restored"]);
  });
});

describe("count deletion permissions", () => {
  it("prevents non-admin deletion when a count family contains a finalised record", () => {
    const workspace = workspaceWithCount();
    workspace.inventories.push({
      ...(workspace.inventories[0] as Record<string, Json | undefined>),
      id: "recount-1",
      label: "August Count — Re-count 1",
      recordType: "recount",
      parentCountId: "count-1",
      status: "finalised",
      finalised: true,
    });
    expect(() => deleteCountFromWorkspace(workspace, "count-1", false)).toThrow("finalised_count_delete_forbidden");
  });

  it("lets an admin delete an original count and its linked recounts together", () => {
    const workspace = workspaceWithCount();
    workspace.inventories.push({
      ...(workspace.inventories[0] as Record<string, Json | undefined>),
      id: "recount-1",
      label: "August Count — Re-count 1",
      recordType: "recount",
      parentCountId: "count-1",
      status: "finalised",
      finalised: true,
    });
    const result = deleteCountFromWorkspace(workspace, "count-1", true);
    expect(result.inventories).toEqual([]);
  });
});
