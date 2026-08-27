import type { Json } from "@/types/database";

type JsonObject = { [key: string]: Json | undefined };

type CountMutationActor = {
  id?: Json;
  name?: Json;
  role?: Json;
  userId?: Json;
};

type CountZeroRoom = {
  roomId: string;
  productIds: string[];
};

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

function safeActor(actor: CountMutationActor): JsonObject {
  return {
    id: typeof actor.id === "string" ? actor.id : typeof actor.userId === "string" ? actor.userId : "",
    name: typeof actor.name === "string" ? actor.name : "Team member",
    role: typeof actor.role === "string" ? actor.role : "Team member",
  };
}

function historyEntry(action: string, actor: CountMutationActor, details: JsonObject = {}): JsonObject {
  return {
    id: crypto.randomUUID(),
    action,
    at: new Date().toISOString(),
    actor: safeActor(actor),
    details,
  };
}

function appendCountHistory(count: JsonObject, entry: JsonObject): JsonObject {
  const history = Array.isArray(count.history) ? count.history : [];
  return { ...count, history: [...history, entry] };
}

function roomQuantityChanges(before: JsonObject, after: JsonObject) {
  const productIds = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...productIds].flatMap((productId) => {
    const previous = before[productId];
    const next = after[productId];
    if (previous === next) return [];
    return [{ productId, before: previous ?? null, after: next ?? null }];
  });
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
  if (!existing) {
    const createdBy = isCountJsonObject(draft.createdBy) ? draft.createdBy : {};
    const storedDraft = Array.isArray(draft.history)
      ? draft
      : appendCountHistory(draft, historyEntry("created", createdBy, {
        label: typeof draft.label === "string" ? draft.label : "Inventory Count",
        date: typeof draft.date === "string" ? draft.date : "",
        recordType: draft.recordType === "recount" ? "recount" : "count",
      }));
    inventories.push(storedDraft);
  }
  inventories.sort((left, right) => {
    const leftDate = isCountJsonObject(left) ? String(left.date ?? "") : "";
    const rightDate = isCountJsonObject(right) ? String(right.date ?? "") : "";
    return rightDate.localeCompare(leftDate);
  });
  return { ...workspace, inventories };
}

export function importRoomlessCountInWorkspace(data: Json, imported: JsonObject): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? [...workspace.inventories] : [];
  const importedId = String(imported.id ?? "");
  if (!importedId) throw new Error("count_not_found");
  if (inventories.some((candidate) => isCountJsonObject(candidate) && candidate.id === importedId)) return workspace;
  const actor = isCountJsonObject(imported.createdBy) ? imported.createdBy : {};
  inventories.push(appendCountHistory({
    ...imported,
    rooms: [],
    draft: false,
    status: "finalised",
    finalised: true,
    recordType: "imported",
  }, historyEntry("imported", actor, {
    sourceFile: typeof imported.sourceFile === "string" ? imported.sourceFile : "",
    importedItems: isCountJsonObject(imported.items) ? Object.keys(imported.items).length : 0,
  })));
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
  actor: CountMutationActor,
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
    let changedRoomName = "Room";
    let changes: Json[] = [];
    const nextRooms = rooms.map((room) => {
      if (!isCountJsonObject(room) || room.id !== roomId) return room;
      foundRoom = true;
      changedRoomName = typeof room.name === "string" ? room.name : "Room";
      changes = roomQuantityChanges(isCountJsonObject(room.items) ? room.items : {}, roomItems);
      return { ...room, items: roomItems, extraProductIds: safeExtraProductIds };
    });
    const items = mergedRoomItems(nextRooms);
    const updatedAt = new Date().toISOString();
    return appendCountHistory({
      ...candidate,
      rooms: nextRooms,
      items,
      draft: Object.keys(items).length === 0,
      updatedBy: safeActor(actor),
      updatedAt,
    }, historyEntry("room_saved", actor, {
      roomId,
      roomName: changedRoomName,
      changes,
      changedItems: changes.length,
    }));
  });
  if (!foundCount || !foundRoom) throw new Error("count_room_not_found");
  return { ...workspace, inventories: nextInventories };
}

export function finaliseCountInWorkspace(
  data: Json,
  countId: string,
  actor: CountMutationActor,
  zeroItemsByRoom: CountZeroRoom[] = [],
): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  const activeProductIds = new Set(
    (Array.isArray(workspace.products) ? workspace.products : [])
      .filter((product) => isCountJsonObject(product) && product.archived !== true && typeof product.id === "string")
      .map((product) => String((product as JsonObject).id)),
  );
  const zeroIdsByRoom = new Map(zeroItemsByRoom.map((entry) => [
    entry.roomId,
    [...new Set(entry.productIds)].filter((productId) => activeProductIds.has(productId)),
  ]));
  let foundCount = false;
  const finalisedAt = new Date().toISOString();
  const nextInventories = inventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || candidate.id !== countId) return candidate;
    foundCount = true;
    if (candidate.status === "finalised" || candidate.finalised === true) throw new Error("count_finalised");
    let zeroedItems = 0;
    const hasRooms = Array.isArray(candidate.rooms) && candidate.rooms.length > 0;
    const rooms = (hasRooms ? candidate.rooms as Json[] : []).map((room) => {
      if (!isCountJsonObject(room) || typeof room.id !== "string") return room;
      const zeroIds = zeroIdsByRoom.get(room.id) ?? [];
      if (!zeroIds.length) return room;
      const items = isCountJsonObject(room.items) ? { ...room.items } : {};
      zeroIds.forEach((productId) => {
        if (Object.prototype.hasOwnProperty.call(items, productId)) return;
        items[productId] = 0;
        zeroedItems += 1;
      });
      return { ...room, items };
    });
    return appendCountHistory({
      ...candidate,
      rooms,
      items: hasRooms ? mergedRoomItems(rooms) : candidate.items,
      draft: false,
      status: "finalised",
      finalised: true,
      finalisedBy: safeActor(actor),
      finalisedAt,
      updatedBy: safeActor(actor),
      updatedAt: finalisedAt,
    }, historyEntry("finalised", actor, { zeroedItems }));
  });
  if (!foundCount) throw new Error("count_not_found");
  return { ...workspace, inventories: nextInventories };
}

export function setCountArchivedInWorkspace(
  data: Json,
  countId: string,
  archived: boolean,
  actor: CountMutationActor,
): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  let foundCount = false;
  const updatedAt = new Date().toISOString();
  const nextInventories = inventories.map((candidate) => {
    if (!isCountJsonObject(candidate) || candidate.id !== countId) return candidate;
    foundCount = true;
    return appendCountHistory({
      ...candidate,
      archived,
      updatedBy: safeActor(actor),
      updatedAt,
    }, historyEntry(archived ? "archived" : "restored", actor));
  });
  if (!foundCount) throw new Error("count_not_found");
  return { ...workspace, inventories: nextInventories };
}

export function deleteCountFromWorkspace(data: Json, countId: string, allowFinalised: boolean): JsonObject {
  const workspace = isCountJsonObject(data) ? data : {};
  const inventories = Array.isArray(workspace.inventories) ? workspace.inventories : [];
  const target = inventories.find((candidate) => isCountJsonObject(candidate) && candidate.id === countId);
  if (!target || !isCountJsonObject(target)) throw new Error("count_not_found");
  const deletingRoot = target.recordType !== "recount";
  const deletedCounts = inventories.filter((candidate) => isCountJsonObject(candidate) && (
    candidate.id === countId
    || (deletingRoot && candidate.recordType === "recount" && candidate.parentCountId === countId)
  ));
  if (!allowFinalised && deletedCounts.some((candidate) => isCountJsonObject(candidate)
    && (candidate.status === "finalised" || candidate.finalised === true))) {
    throw new Error("finalised_count_delete_forbidden");
  }
  const nextInventories = inventories.filter((candidate) => {
    if (!isCountJsonObject(candidate)) return true;
    if (candidate.id === countId) return false;
    return !(deletingRoot && candidate.recordType === "recount" && candidate.parentCountId === countId);
  });
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
