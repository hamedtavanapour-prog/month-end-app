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
  extraProductIds: string[],
  actor: JsonObject,
): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  const activeProductIds = new Set(
    (Array.isArray(workspace.products) ? workspace.products : [])
      .filter((product) => isCountJsonObject(product) && product.archived !== true && typeof product.id === "string")
      .map((product) => String((product as JsonObject).id)),
  );
  const safeExtraProductIds = [...new Set(extraProductIds)].filter((productId) => activeProductIds.has(productId));
  let foundCount = false;
  let foundRoom = false;
  const nextInventories = inventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || candidate.id !== countId) return candidate;
    foundCount = true;
    if (candidate.status === "finalised" || candidate.finalised === true) {
      throw new Error("count_finalised");
    }
    const rooms = Array.isArray(candidate.rooms) ? candidate.rooms : [];
    const nextRooms = rooms.map((room) => {
      if (!isCountJsonObject(room) || room.id !== roomId) return room;
      foundRoom = true;
      return { ...room, items: roomItems, extraProductIds: safeExtraProductIds };
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

export function finaliseCountInWorkspace(data: Json, countId: string, actor: JsonObject): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  let foundCount = false;
  const finalisedAt = new Date().toISOString();
  const nextInventories = inventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || candidate.id !== countId) return candidate;
    foundCount = true;
    return {
      ...candidate,
      draft: false,
      status: "finalised",
      finalised: true,
      finalisedBy: actor,
      finalisedAt,
      updatedBy: actor,
      updatedAt: finalisedAt,
    };
  });
  if (!foundCount) throw new Error("count_not_found");
  return { ...workspace, inventories: nextInventories };
}

export function preserveFinalisedCounts(currentData: Json, incomingData: Json): Json {
  if (!isCountJsonObject(currentData) || !isCountJsonObject(incomingData)) return incomingData;
  const currentInventories = Array.isArray(currentData.inventories) ? currentData.inventories : [];
  const incomingInventories = Array.isArray(incomingData.inventories) ? incomingData.inventories : [];
  const protectedById = new Map(
    currentInventories
      .filter((candidate) => isCountJsonObject(candidate) && (candidate.status === "finalised" || candidate.finalised === true) && typeof candidate.id === "string")
      .map((candidate) => [String((candidate as JsonObject).id), candidate]),
  );
  if (!protectedById.size) return incomingData;
  const seen = new Set<string>();
  const inventories = incomingInventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || typeof candidate.id !== "string") return candidate;
    const id = String(candidate.id);
    const protectedCount = protectedById.get(id);
    if (!protectedCount) return candidate;
    seen.add(id);
    return {
      ...(protectedCount as JsonObject),
      archived: candidate.archived === true,
      updatedBy: candidate.updatedBy,
      updatedAt: candidate.updatedAt,
    };
  });
  protectedById.forEach((candidate, id) => {
    if (!seen.has(id)) inventories.push(candidate);
  });
  return { ...incomingData, inventories };
}
