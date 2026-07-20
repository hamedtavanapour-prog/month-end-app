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
