import type { Json } from "@/types/database";

type JsonObject = { [key: string]: Json | undefined };

export function isCountJsonObject(value: Json | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergedRoomItems(rooms: Json[]) {
  const items: JsonObject = {};
  rooms.forEach((candidate) => {
    if (!isCountJsonObject(candidate) || !isCountJsonObject(candidate.items)) return;
    Object.entries(candidate.items).forEach(([productId, quantity]) => {
      if (typeof quantity !== "number" || !Number.isFinite(quantity)) return;
      const current = typeof items[productId] === "number" ? items[productId] : 0;
      items[productId] = current + quantity;
    });
  });
  return items;
}

export function createCountDraftInWorkspace(data: Json, draft: JsonObject): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? [...workspace.inventories] : [];
  const draftId = String(draft.id ?? "");
  const draftDate = String(draft.date ?? "");
  const draftLabel = String(draft.label ?? "").trim().toLowerCase();
  const existing = inventories.find((candidate) => isCountJsonObject(candidate) && (
    candidate.id === draftId
    || (candidate.date === draftDate && String(candidate.label ?? "").trim().toLowerCase() === draftLabel)
  ));
  if (!existing) inventories.push(draft);
  inventories.sort((left, right) => {
    const leftDate = isCountJsonObject(left) ? String(left.date ?? "") : "";
    const rightDate = isCountJsonObject(right) ? String(right.date ?? "") : "";
    return rightDate.localeCompare(leftDate);
  });
  return { ...workspace, inventories };
}

export function saveCountRoomInWorkspace(
  data: Json,
  countId: string,
  roomId: string,
  roomItems: JsonObject,
  actor: JsonObject,
): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  let foundCount = false;
  let foundRoom = false;
  const nextInventories = inventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || candidate.id !== countId) return candidate;
    foundCount = true;
    const rooms = Array.isArray(candidate.rooms) ? candidate.rooms : [];
    const nextRooms = rooms.map((room) => {
      if (!isCountJsonObject(room) || room.id !== roomId) return room;
      foundRoom = true;
      return { ...room, items: roomItems };
    });
    const items = mergedRoomItems(nextRooms);
    return {
      ...candidate,
      rooms: nextRooms,
      items,
      draft: Object.keys(items).length === 0,
      updatedBy: actor,
      updatedAt: new Date().toISOString(),
    };
  });
  if (!foundCount || !foundRoom) throw new Error("count_room_not_found");
  return { ...workspace, inventories: nextInventories };
}
