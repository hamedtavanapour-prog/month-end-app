import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

function loadInventoryHelpers(inventories: Array<Record<string, unknown>> = []) {
  const source = readFileSync(new URL("../../public/legacy/js/inventory.js", import.meta.url), "utf8");
  const products = [
    { id: "listed", name: "Listed Bottle", category: "Spirits", subcategory: "Vodka", unit: "bottle", archived: false },
    { id: "extra", name: "Extra Bottle", category: "Beer", subcategory: "Lager", unit: "bottle", archived: false },
  ];
  const context = {
    state: {
      products,
      rooms: [{ id: "floor-room", name: "Main Bar", archived: false, departmentId: "bar", categoryNames: ["Spirits"], manualProductIds: [] }],
      inventories,
      usageLogs: [],
    },
    currentInvEdit: null,
    currentInvRoomId: null,
    currentInvMergedView: false,
    currentInvRooms: [],
    currentCountRoomLock: null,
    liveInventoryBaselineId: null,
    liveInventoryRoomIds: null,
    document: { addEventListener: () => undefined, getElementById: () => null, querySelectorAll: () => [] },
    window: { addEventListener: () => undefined },
    getProduct: (id: string) => products.find((product) => product.id === id),
    liveQty: (value: unknown) => String(value),
    uid: () => "generated",
  };
  runInNewContext(`${source}\n;globalThis.__helpers={countProductDisplayGroup,inventoryUncountedEntries,countReportRoomDetailText,countReportRoomMatrixRows};`, context);
  return (context as typeof context & { __helpers: {
    countProductDisplayGroup: (product: typeof products[number], room: { extraProductIds: string[] }) => { category: string; subcategory: string };
    inventoryUncountedEntries: (inventory: Record<string, unknown>) => Array<{ productId: string; roomId: string }>;
    countReportRoomDetailText: (inventory: Record<string, unknown>, product: typeof products[number]) => string;
    countReportRoomMatrixRows: (inventory: Record<string, unknown>, order?: string) => { rows: unknown[][] };
  } }).__helpers;
}

describe("count workflow helpers", () => {
  it("groups every count-only addition under Unlisted", () => {
    const helpers = loadInventoryHelpers();
    expect(helpers.countProductDisplayGroup(
      { id: "extra", name: "Extra Bottle", category: "Beer", subcategory: "Lager", unit: "bottle", archived: false },
      { extraProductIds: ["extra"] },
    )).toEqual({ category: "Unlisted", subcategory: "Added Items" });
  });

  it("treats an entered zero as counted and finds only absent room items", () => {
    const helpers = loadInventoryHelpers();
    const inventory = {
      id: "count",
      rooms: [{ id: "count-room", roomId: "floor-room", name: "Main Bar", items: { listed: 0 }, extraProductIds: ["extra"] }],
    };
    expect(helpers.inventoryUncountedEntries(inventory)).toEqual([
      expect.objectContaining({ productId: "extra", roomId: "count-room" }),
    ]);
  });

  it("formats the saved quantity for every room beneath a report item", () => {
    const helpers = loadInventoryHelpers();
    const inventory = { rooms: [
      { name: "Main Bar", items: { listed: 2 } },
      { name: "Storage", items: { listed: 0 } },
      { name: "Patio", items: {} },
    ] };
    expect(helpers.countReportRoomDetailText(inventory, {
      id: "listed", name: "Listed Bottle", category: "Spirits", subcategory: "Vodka", unit: "bottle", archived: false,
    })).toBe("Room counts: Main Bar: 2 bottle · Storage: 0 bottle · Patio: Not counted");
  });

  it("puts every product total and every room quantity on one report sheet", () => {
    const helpers = loadInventoryHelpers();
    const inventory = { items: { listed: 2, extra: 3 }, rooms: [
      { id: "main", name: "Main Bar", items: { listed: 2, extra: 1 } },
      { id: "storage", name: "Storage", items: { listed: 0, extra: 2 } },
      { id: "patio", name: "Patio", items: {} },
    ] };

    expect(helpers.countReportRoomMatrixRows(inventory, "alpha").rows.slice(0,3)).toEqual([
      ["Product", "Total", "Main Bar", "Storage", "Patio", "Unit", "Category", "Subcategory", "Unit Cost", "Value"],
      ["Extra Bottle", 3, 1, 2, "", "bottle", "Beer", "Lager", 0, 0],
      ["Listed Bottle", 2, 2, 0, "", "bottle", "Spirits", "Vodka", 0, 0],
    ]);
  });

  it("uses re-count room quantities while retaining rooms from the original count", () => {
    const source = {
      id: "source-count",
      items: { listed: 2 },
      rooms: [{ id: "source-room", roomId: "floor-room", name: "Main Bar", items: { listed: 2 } }],
    };
    const helpers = loadInventoryHelpers([source]);
    const recount = {
      id: "recount",
      recordType: "recount",
      parentCountId: "source-count",
      rooms: [{ id: "recount-room", roomId: "floor-room", name: "Main Bar", items: { listed: 5 } }],
    };

    expect(helpers.countReportRoomDetailText(recount, {
      id: "listed", name: "Listed Bottle", category: "Spirits", subcategory: "Vodka", unit: "bottle", archived: false,
    })).toBe("Room counts: Main Bar: 5 bottle");
  });
});

function loadTranscribeHelpers() {
  const source = readFileSync(new URL("../../public/legacy/js/voice.js", import.meta.url), "utf8");
  const parseVoice = (text: string) => text.split(",").map((item) => item.trim()).filter(Boolean);
  const context = {
    document: { addEventListener: () => undefined, getElementById: () => null },
    window: { MonthEndVoiceCommands: { NUMS: {}, wordsToNumber: () => null, parseVoice, applyCountOperation: () => 0 } },
  };
  runInNewContext(`${source}\n;globalThis.__helpers={transcribeHistoryEntryCount,transcribeHistoryTotals};`, context);
  return (context as typeof context & { __helpers: {
    transcribeHistoryEntryCount: (type: string, title: string, text: string) => number;
    transcribeHistoryTotals: (history: Array<Record<string, unknown>>) => { transcribed: number; applied: number; notApplied: number };
  } }).__helpers;
}

describe("transcribe history totals", () => {
  it("shows transcribed, applied, and not-applied item totals", () => {
    const helpers = loadTranscribeHelpers();
    const history = [
      { type: "transcript", title: "Transcription", text: "Vodka 2, Lager 1", itemCount: 2 },
      { type: "applied", title: "1 item applied", text: "Vodka", itemCount: 1 },
      { type: "unmatched", title: "1 item not applied", text: "Lager", itemCount: 1 },
    ];
    expect(helpers.transcribeHistoryTotals(history)).toEqual({ transcribed: 2, applied: 1, notApplied: 1 });
  });
});
