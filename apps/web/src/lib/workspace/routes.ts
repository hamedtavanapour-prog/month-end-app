import type { AccessContext } from "@/lib/auth/context";

export type LegacyPage =
  | "dashboard"
  | "products"
  | "live-inventory"
  | "inventory"
  | "orders"
  | "usage"
  | "insights"
  | "suppliers"
  | "reports"
  | "settings";

export type LegacyDestination = {
  page: LegacyPage;
  section?: string;
  reportView?: "usage" | "value" | "rorders";
  resourceKind?: "product" | "menu-item" | "count" | "usage" | "order" | "supplier" | "room" | "category" | "department" | "menu";
  resourceId?: string;
  action?: "new" | "edit" | "import";
};

export type WorkspaceRoute = {
  canonicalPath: string;
  title: string;
  destination: LegacyDestination;
  permissions: string[];
  managerAllowed?: boolean;
};

const pageRoutes: Record<string, WorkspaceRoute> = {
  dashboard: route("/app/dashboard", "Dashboard", { page: "dashboard" }, ["dashboard.view"]),
  "catalog/products": route("/app/catalog/products", "Products", { page: "products" }, ["products.view"]),
  "inventory/live": route("/app/inventory/live", "Live Inventory", { page: "live-inventory" }, ["inventory.view"]),
  "inventory/counts": route("/app/inventory/counts", "Counts", { page: "inventory" }, ["counts.view"]),
  "purchasing/orders": route("/app/purchasing/orders", "Orders", { page: "orders" }, ["orders.view"]),
  "inventory/usage": route("/app/inventory/usage", "Usage", { page: "usage" }, ["usage.view"]),
  "intelligence/insights": route("/app/intelligence/insights", "Insights", { page: "insights" }, ["dashboard.view", "reports.view"]),
  "purchasing/suppliers": route("/app/purchasing/suppliers", "Suppliers", { page: "suppliers" }, ["suppliers.view"]),
  "intelligence/reports/usage": route("/app/intelligence/reports/usage", "Usage Reports", { page: "reports", reportView: "usage" }, ["reports.view"]),
  "intelligence/reports/inventory-value": route("/app/intelligence/reports/inventory-value", "Inventory Value", { page: "reports", reportView: "value" }, ["reports.view"]),
  "intelligence/reports/order-history": route("/app/intelligence/reports/order-history", "Order History", { page: "reports", reportView: "rorders" }, ["reports.view"]),
  "settings/general": settingsRoute("/app/settings/general", "General Settings", "general"),
  "settings/floor-plan": settingsRoute("/app/settings/floor-plan", "Floor Plan", "floor-plan", ["settings.rooms"]),
  "catalog/categories": settingsRoute("/app/catalog/categories", "Categories", "categories"),
  "settings/departments": settingsRoute("/app/settings/departments", "Departments", "departments", ["settings.departments"]),
  "catalog/menus": settingsRoute("/app/catalog/menus", "Menus", "product-menus"),
  "settings/users": { ...settingsRoute("/app/settings/users", "Users & Access", "profiles", ["settings.users"]), managerAllowed: true },
  "settings/appearance": settingsRoute("/app/settings/appearance", "Appearance", "appearance"),
  "settings/system": settingsRoute("/app/settings/system", "System & Storage", "sync"),
  "settings/exports": settingsRoute("/app/settings/exports", "Export Preferences", "exports"),
};

const aliases: Record<string, string> = {
  products: "/app/catalog/products",
  "live-inventory": "/app/inventory/live",
  counts: "/app/inventory/counts",
  inventory: "/app/inventory/counts",
  orders: "/app/purchasing/orders",
  usage: "/app/inventory/usage",
  insights: "/app/intelligence/insights",
  suppliers: "/app/purchasing/suppliers",
  reports: "/app/intelligence/reports/usage",
  "intelligence/reports": "/app/intelligence/reports/usage",
  settings: "/app/settings/general",
  "settings/categories": "/app/catalog/categories",
  "settings/product-menus": "/app/catalog/menus",
  "settings/sync": "/app/settings/system",
};

function route(
  canonicalPath: string,
  title: string,
  destination: LegacyDestination,
  permissions: string[],
): WorkspaceRoute {
  return { canonicalPath, title, destination, permissions };
}

function settingsRoute(
  canonicalPath: string,
  title: string,
  section: string,
  permissions = ["settings.rooms", "settings.departments", "settings.users", "settings.permissions"],
): WorkspaceRoute {
  return route(canonicalPath, title, { page: "settings", section }, permissions);
}

function dynamicRoute(segments: string[]): WorkspaceRoute | null {
  const [area, subsection, id, action] = segments;
  if (area === "catalog" && subsection === "products" && id) {
    if (id === "new") return route("/app/catalog/products/new", "New Product", { page: "products", action: "new" }, ["products.manage"]);
    return route(`/app/catalog/products/${encodeURIComponent(id)}${action === "edit" ? "/edit" : ""}`, action === "edit" ? "Edit Product" : "Product Details", { page: "products", resourceKind: "product", resourceId: id, action: action === "edit" ? "edit" : undefined }, [action === "edit" ? "products.manage" : "products.view"]);
  }
  if (area === "catalog" && subsection === "menu-items" && id) {
    return route(`/app/catalog/menu-items/${encodeURIComponent(id)}`, "Menu Item", { page: "products", resourceKind: "menu-item", resourceId: id }, ["products.view"]);
  }
  if (area === "inventory" && subsection === "counts" && id) {
    if (id === "new") return route("/app/inventory/counts/new", "New Count", { page: "inventory", action: "new" }, ["counts.create"]);
    return route(`/app/inventory/counts/${encodeURIComponent(id)}${action === "edit" ? "/edit" : ""}`, action === "edit" ? "Edit Count" : "Count Details", { page: "inventory", resourceKind: "count", resourceId: id, action: action === "edit" ? "edit" : undefined }, [action === "edit" ? "counts.create" : "counts.view"]);
  }
  if (area === "inventory" && subsection === "usage" && id) {
    if (id === "import") return route("/app/inventory/usage/import", "Import Usage", { page: "usage", action: "import" }, ["usage.upload"]);
    return route(`/app/inventory/usage/${encodeURIComponent(id)}${action === "edit" ? "/edit" : ""}`, action === "edit" ? "Edit Usage" : "Usage Details", { page: "usage", resourceKind: "usage", resourceId: id, action: action === "edit" ? "edit" : undefined }, [action === "edit" ? "usage.manage" : "usage.view"]);
  }
  if (area === "purchasing" && subsection === "orders" && id) {
    if (id === "new") return route("/app/purchasing/orders/new", "New Order", { page: "orders", action: "new" }, ["orders.manage"]);
    return route(`/app/purchasing/orders/${encodeURIComponent(id)}${action === "edit" ? "/edit" : ""}`, action === "edit" ? "Edit Order" : "Order Details", { page: "orders", resourceKind: "order", resourceId: id, action: action === "edit" ? "edit" : undefined }, [action === "edit" ? "orders.manage" : "orders.view"]);
  }
  if (area === "purchasing" && subsection === "suppliers" && id) {
    if (id === "new") return route("/app/purchasing/suppliers/new", "New Supplier", { page: "suppliers", action: "new" }, ["suppliers.manage"]);
    return route(`/app/purchasing/suppliers/${encodeURIComponent(id)}${action === "edit" ? "/edit" : ""}`, action === "edit" ? "Edit Supplier" : "Supplier Details", { page: "suppliers", resourceKind: "supplier", resourceId: id, action: action === "edit" ? "edit" : undefined }, [action === "edit" ? "suppliers.manage" : "suppliers.view"]);
  }
  if (area === "settings" && subsection === "floor-plan" && id === "rooms" && action) {
    return route(`/app/settings/floor-plan/rooms/${encodeURIComponent(action)}`, "Room Settings", { page: "settings", section: "floor-plan", resourceKind: "room", resourceId: action }, ["settings.rooms"]);
  }
  if (area === "catalog" && subsection === "categories" && id) {
    return route(`/app/catalog/categories/${encodeURIComponent(id)}`, "Category Settings", { page: "settings", section: "categories", resourceKind: "category", resourceId: id }, ["settings.rooms", "settings.departments", "settings.users", "settings.permissions"]);
  }
  if (area === "settings" && subsection === "departments" && id) {
    return route(`/app/settings/departments/${encodeURIComponent(id)}`, "Department Settings", { page: "settings", section: "departments", resourceKind: "department", resourceId: id }, ["settings.departments"]);
  }
  if (area === "catalog" && subsection === "menus" && id) {
    return route(`/app/catalog/menus/${encodeURIComponent(id)}`, "Menu Settings", { page: "settings", section: "product-menus", resourceKind: "menu", resourceId: id }, ["settings.rooms", "settings.departments", "settings.users", "settings.permissions"]);
  }
  return null;
}

export function resolveWorkspaceRoute(segments: string[]): WorkspaceRoute | null {
  const key = segments.join("/");
  return pageRoutes[key] ?? dynamicRoute(segments);
}

export function workspaceRouteAlias(segments: string[]) {
  return aliases[segments.join("/")] ?? null;
}

export function canAccessWorkspaceRoute(context: AccessContext, workspaceRoute: WorkspaceRoute) {
  if (context.role === "owner" || context.role === "admin") return true;
  if (workspaceRoute.managerAllowed && context.role === "manager") return true;
  return workspaceRoute.permissions.some((permission) => context.permissionKeys.includes(permission));
}

export function defaultWorkspacePath(context: AccessContext) {
  const preferredRoutes = [
    pageRoutes.dashboard,
    pageRoutes["inventory/live"],
    pageRoutes["inventory/counts"],
    pageRoutes["catalog/products"],
    pageRoutes["purchasing/orders"],
    pageRoutes["inventory/usage"],
    pageRoutes["purchasing/suppliers"],
    pageRoutes["intelligence/reports/usage"],
    pageRoutes["settings/users"],
  ];
  return preferredRoutes.find((workspaceRoute) => canAccessWorkspaceRoute(context, workspaceRoute))?.canonicalPath
    ?? "/app/forbidden";
}

export function legacyDestinationQuery(destination: LegacyDestination) {
  const params = new URLSearchParams({ embedded: "1", page: destination.page });
  if (destination.section) params.set("section", destination.section);
  if (destination.reportView) params.set("report", destination.reportView);
  if (destination.resourceKind) params.set("resource", destination.resourceKind);
  if (destination.resourceId) params.set("id", destination.resourceId);
  if (destination.action) params.set("action", destination.action);
  return params.toString();
}
