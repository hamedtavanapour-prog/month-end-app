import type { Json } from "@/types/database";

type JsonObject = { [key: string]: Json | undefined };

function isJsonObject(value: Json | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function renameCategoryValue(candidate: Json, previousName: string, name: string): Json {
  if (!previousName || !isJsonObject(candidate) || candidate.category !== previousName) return candidate;
  return { ...candidate, category: name };
}

function renameReportCategory(candidate: Json, previousName: string, name: string): Json {
  if (!previousName || !isJsonObject(candidate) || candidate.reportCategory !== previousName) return candidate;
  return { ...candidate, reportCategory: name };
}

export function renameCategoryInWorkspace(
  data: Json,
  previousName: string,
  name: string,
  subcategories: string[],
): JsonObject {
  const workspace = isJsonObject(data) ? data : {};
  const inventoryCategories = isJsonObject(workspace.inventoryCategories)
    ? workspace.inventoryCategories
    : {};
  const nextCategories: JsonObject = {};
  let inserted = false;
  Object.entries(inventoryCategories).forEach(([categoryName, values]) => {
    if (categoryName === name && name !== previousName) return;
    if (categoryName === previousName) {
      nextCategories[name] = subcategories;
      inserted = true;
      return;
    }
    nextCategories[categoryName] = values;
  });
  if (!inserted) nextCategories[name] = subcategories;

  const products = Array.isArray(workspace.products)
    ? workspace.products.map((item) => renameCategoryValue(item, previousName, name))
    : [];
  const importBacklog = Array.isArray(workspace.importBacklog)
    ? workspace.importBacklog.map((item) => renameCategoryValue(item, previousName, name))
    : [];
  const rooms = Array.isArray(workspace.rooms)
    ? workspace.rooms.map((candidate) => {
      if (!isJsonObject(candidate) || !Array.isArray(candidate.categoryNames)) return candidate;
      const categoryNames = [...new Set(candidate.categoryNames.map((value) => (
        previousName && String(value) === previousName ? name : String(value)
      )))];
      return { ...candidate, categoryNames };
    })
    : [];
  const uploadedUsage = Array.isArray(workspace.uploadedUsage)
    ? workspace.uploadedUsage.map((item) => renameReportCategory(item, previousName, name))
    : [];
  const usageLogs = Array.isArray(workspace.usageLogs)
    ? workspace.usageLogs.map((candidate) => {
      if (!isJsonObject(candidate) || !Array.isArray(candidate.rows)) return candidate;
      return {
        ...candidate,
        rows: candidate.rows.map((row) => renameReportCategory(row, previousName, name)),
      };
    })
    : [];

  return {
    ...workspace,
    inventoryCategories: nextCategories,
    products,
    importBacklog,
    rooms,
    uploadedUsage,
    usageLogs,
  };
}
