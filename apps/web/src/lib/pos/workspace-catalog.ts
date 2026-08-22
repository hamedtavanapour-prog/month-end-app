import type { Json } from "@/types/database";

export type MonthEndProduct = {
  id: string;
  name: string;
  unit?: string;
  unitSize?: string;
};

export type MonthEndRecipeVariant = {
  key: string;
  name: string;
};

export type MonthEndRecipeIngredient = {
  id: string;
  name: string;
  amount?: string;
  amounts?: Record<string, string>;
  linkKind?: string;
  productId?: string;
};

export type MonthEndMenuItem = {
  id: string;
  name: string;
  menuId: string;
  menuName: string;
  variants: MonthEndRecipeVariant[];
  ingredients: MonthEndRecipeIngredient[];
};

type JsonObject = { [key: string]: Json | undefined };

function object(value: Json | undefined): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function text(value: Json | undefined) {
  return typeof value === "string" ? value : "";
}

export function extractWorkspaceCatalog(data: Json | null | undefined) {
  const workspace = object(data);
  const products: MonthEndProduct[] = (Array.isArray(workspace?.products) ? workspace.products : []).flatMap((entry) => {
    const product = object(entry);
    const id = text(product?.id);
    const name = text(product?.name);
    if (!product || !id || !name || product.archived === true) return [];
    const units = Array.isArray(product.units)
      ? product.units.flatMap((unit) => {
          const parsed = object(unit);
          return parsed ? [parsed] : [];
        })
      : [];
    return [{
      id,
      name,
      unit: text(product.unit),
      unitSize: text(units[0]?.unitSize) || text(product.unitSize),
    }];
  });
  const menus = Array.isArray(workspace?.menus) ? workspace.menus : [];
  const menuItems: MonthEndMenuItem[] = menus.flatMap((entry) => {
    const menu = object(entry);
    if (!menu || menu.archived === true) return [];
    const menuId = text(menu.id);
    const menuName = text(menu.name) || "Menu";
    return (Array.isArray(menu.items) ? menu.items : []).flatMap((candidate) => {
      const item = object(candidate);
      const id = text(item?.id);
      const name = text(item?.name);
      if (!item || !id || !name) return [];
      const variants = (Array.isArray(item.variants) ? item.variants : []).flatMap((variantEntry) => {
        const variant = object(variantEntry);
        const key = text(variant?.key);
        if (!key) return [];
        return [{ key, name: text(variant?.name) || key }];
      });
      const safeVariants = variants.length ? variants : [{ key: "one", name: "One Size" }];
      const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : []).flatMap((ingredientEntry) => {
        const ingredient = object(ingredientEntry);
        const ingredientName = text(ingredient?.name);
        if (!ingredientName) return [];
        const rawAmounts = object(ingredient?.amounts);
        const amounts = rawAmounts ? Object.fromEntries(Object.entries(rawAmounts).flatMap(([key, amount]) => typeof amount === "string" ? [[key, amount]] : [])) : undefined;
        return [{
          id: text(ingredient?.id) || `${id}:${ingredientName}`,
          name: ingredientName,
          amount: text(ingredient?.amount),
          amounts,
          linkKind: text(ingredient?.linkKind),
          productId: text(ingredient?.productId),
        }];
      });
      return [{ id, name, menuId, menuName, variants: safeVariants, ingredients }];
    });
  });
  return { products, menuItems };
}
