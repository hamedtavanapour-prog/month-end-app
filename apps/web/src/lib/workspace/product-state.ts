import type { Json } from "@/types/database";

type JsonObject = { [key: string]: Json | undefined };

export function isJsonObject(value: Json | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function mergeProductIntoWorkspace(
  data: Json,
  incomingProduct: JsonObject,
  productCatalogVersion?: string,
): JsonObject {
  const workspace = isJsonObject(data) ? data : {};
  const productId = String(incomingProduct.id ?? "");
  const products = Array.isArray(workspace.products) ? workspace.products : [];
  let found = false;
  const nextProducts = products.map((candidate) => {
    if (!isJsonObject(candidate) || String(candidate.id ?? "") !== productId) return candidate;
    found = true;
    return { ...candidate, ...incomingProduct };
  });
  if (!found) nextProducts.push(incomingProduct);

  const linkedSupplierIds = new Set(
    Array.isArray(incomingProduct.suppliers)
      ? incomingProduct.suppliers.map((supplierId) => String(supplierId))
      : [],
  );
  const suppliers = Array.isArray(workspace.suppliers) ? workspace.suppliers : [];
  const nextSuppliers = suppliers.map((candidate) => {
    if (!isJsonObject(candidate)) return candidate;
    const supplierId = String(candidate.id ?? "");
    const productIds = Array.isArray(candidate.products)
      ? candidate.products.map((id) => String(id)).filter((id) => id !== productId)
      : [];
    if (linkedSupplierIds.has(supplierId)) productIds.push(productId);
    return { ...candidate, products: productIds };
  });

  return {
    ...workspace,
    products: nextProducts,
    suppliers: nextSuppliers,
    ...(productCatalogVersion ? { productCatalogVersion } : {}),
  };
}

function replaceProductIds(value: Json | undefined, keepId: string, removeId: string): Json[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id) === removeId ? keepId : String(id)).filter(Boolean))];
}

function mergeQuantityMap(value: Json | undefined, keepId: string, removeId: string): JsonObject {
  if (!isJsonObject(value) || !(removeId in value)) return isJsonObject(value) ? value : {};
  const next = { ...value };
  const kept = typeof next[keepId] === "number" ? next[keepId] : 0;
  const removed = typeof next[removeId] === "number" ? next[removeId] : 0;
  next[keepId] = kept + removed;
  delete next[removeId];
  return next;
}

function mergeUsageRows(value: Json | undefined, keepId: string, removeId: string, keepName: string): Json[] {
  if (!Array.isArray(value)) return [];
  const result: Json[] = [];
  const numericFields = ["qty", "actualUsage", "idealUsage", "begin", "end", "purch", "transferIn", "transferOut", "production"];
  value.forEach((candidate) => {
    if (!isJsonObject(candidate)) { result.push(candidate); return; }
    const row: JsonObject = String(candidate.productId ?? "") === removeId
      ? { ...candidate, productId: keepId, productName: keepName, matchedName: keepName, matched: true }
      : { ...candidate };
    if (String(row.productId ?? "") !== keepId) { result.push(row); return; }
    const existing = result.find((item) => isJsonObject(item) && String(item.productId ?? "") === keepId);
    if (!isJsonObject(existing)) { result.push(row); return; }
    numericFields.forEach((field) => {
      const left = typeof existing[field] === "number" ? existing[field] : null;
      const right = typeof row[field] === "number" ? row[field] : null;
      if (left !== null || right !== null) existing[field] = (left ?? 0) + (right ?? 0);
    });
  });
  return result;
}

export function mergeProductsInWorkspace(data: Json, keepId: string, removeId: string, keepProduct: JsonObject): JsonObject {
  if (!keepId || !removeId || keepId === removeId) throw new Error("product_merge_invalid");
  const initial = isJsonObject(data) ? data : {};
  const products = Array.isArray(initial.products) ? initial.products : [];
  if (!products.some((item) => isJsonObject(item) && item.id === keepId) || !products.some((item) => isJsonObject(item) && item.id === removeId)) {
    throw new Error("product_merge_not_found");
  }
  const workspace = mergeProductIntoWorkspace(initial, { ...keepProduct, id: keepId });
  const keepName = typeof keepProduct.name === "string" ? keepProduct.name : "Product";
  workspace.products = (Array.isArray(workspace.products) ? workspace.products : []).filter((item) => !isJsonObject(item) || item.id !== removeId);
  workspace.suppliers = (Array.isArray(workspace.suppliers) ? workspace.suppliers : []).map((item) => {
    if (!isJsonObject(item)) return item;
    const products = Array.isArray(item.products)
      ? item.products.map((id) => String(id)).filter((id) => id !== removeId)
      : [];
    return { ...item, products: [...new Set(products)] };
  });
  workspace.rooms = (Array.isArray(workspace.rooms) ? workspace.rooms : []).map((item) => isJsonObject(item) ? { ...item, productIds: Array.isArray(item.productIds) ? replaceProductIds(item.productIds, keepId, removeId) : item.productIds, manualProductIds: replaceProductIds(item.manualProductIds, keepId, removeId) } : item);
  workspace.inventories = (Array.isArray(workspace.inventories) ? workspace.inventories : []).map((item) => {
    if (!isJsonObject(item)) return item;
    const rooms = (Array.isArray(item.rooms) ? item.rooms : []).map((room) => isJsonObject(room) ? { ...room, items: mergeQuantityMap(room.items, keepId, removeId), extraProductIds: replaceProductIds(room.extraProductIds, keepId, removeId) } : room);
    return { ...item, items: mergeQuantityMap(item.items, keepId, removeId), rooms, selectedProductIds: replaceProductIds(item.selectedProductIds, keepId, removeId) };
  });
  workspace.orders = (Array.isArray(workspace.orders) ? workspace.orders : []).map((order) => isJsonObject(order) ? { ...order, lines: (Array.isArray(order.lines) ? order.lines : []).map((line) => isJsonObject(line) && line.productId === removeId ? { ...line, productId: keepId } : line) } : order);
  workspace.usageLogs = (Array.isArray(workspace.usageLogs) ? workspace.usageLogs : []).map((log) => isJsonObject(log) ? { ...log, rows: mergeUsageRows(log.rows, keepId, removeId, keepName) } : log);
  workspace.uploadedUsage = mergeUsageRows(workspace.uploadedUsage, keepId, removeId, keepName);
  if (isJsonObject(workspace.inventoryEntryTemplate) && Array.isArray(workspace.inventoryEntryTemplate.items)) {
    const seen = new Set<string>();
    workspace.inventoryEntryTemplate = {
      ...workspace.inventoryEntryTemplate,
      items: workspace.inventoryEntryTemplate.items.flatMap((item) => {
        if (!isJsonObject(item)) return [item];
        const productId = item.productId === removeId ? keepId : String(item.productId ?? "");
        if (productId && seen.has(productId)) return [];
        if (productId) seen.add(productId);
        return [{ ...item, productId, ...(item.productId === removeId ? { productName: keepName } : {}) }];
      }),
    };
  }
  workspace.drinks = (Array.isArray(workspace.drinks) ? workspace.drinks : []).map((drink) => isJsonObject(drink) ? {
    ...drink,
    linkedProducts: replaceProductIds(drink.linkedProducts, keepId, removeId),
    ingredients: (Array.isArray(drink.ingredients) ? drink.ingredients : []).map((ingredient) => isJsonObject(ingredient) && ingredient.productId === removeId ? { ...ingredient, productId: keepId } : ingredient),
  } : drink);
  workspace.menus = (Array.isArray(workspace.menus) ? workspace.menus : []).map((menu) => isJsonObject(menu) ? {
    ...menu,
    items: (Array.isArray(menu.items) ? menu.items : []).map((item) => isJsonObject(item) ? {
      ...item,
      ingredients: (Array.isArray(item.ingredients) ? item.ingredients : []).map((ingredient) => isJsonObject(ingredient) && ingredient.productId === removeId ? { ...ingredient, productId: keepId, productName: keepName } : ingredient),
    } : item),
  } : menu);
  return workspace;
}
