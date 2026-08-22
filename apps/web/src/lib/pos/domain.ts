import type { Json } from "@/types/database";

export type PosConnectionMode = "mock" | "live";
export type PosConnectionStatus = "not_configured" | "test_mode" | "connected" | "paused" | "error" | "disconnected";
export type PosMappingStatus = "unmapped" | "mapped" | "ignored" | "needs_review";

export type PosLocation = {
  externalId: string;
  name: string;
  timezone?: string;
  metadata?: Record<string, Json | undefined>;
};

export type PosMenuItem = {
  externalId: string;
  name: string;
  category?: string;
  sku?: string;
  price?: number;
  currency?: string;
  isActive: boolean;
  updatedAt?: string;
  raw?: Json;
};

export type PosModifier = {
  externalId?: string;
  name: string;
  quantity: number;
  price?: number;
};

export type PosTicketItem = {
  externalId: string;
  externalMenuItemId?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  total?: number;
  voided?: boolean;
  cancelled?: boolean;
  modifiers?: PosModifier[];
  raw?: Json;
};

export type PosEmployee = {
  externalId: string;
  name: string;
};

export type PosTicket = {
  externalId: string;
  ticketNumber?: string;
  status: string;
  openedAt?: string;
  closedAt?: string;
  updatedAt: string;
  employee?: PosEmployee;
  guestCount?: number;
  subtotal?: number;
  total?: number;
  currency?: string;
  items: PosTicketItem[];
  raw?: Json;
};

export type PosTicketRange = {
  from: Date;
  to: Date;
};

export type PosConnectionResult = {
  ok: boolean;
  mode: PosConnectionMode;
  message: string;
  location?: PosLocation;
};

export type PosWebhookResult = {
  externalEventId?: string;
  eventType: string;
  tickets: PosTicket[];
  raw: Json;
};

export interface PosIntegrationProvider {
  readonly provider: string;
  readonly mode: PosConnectionMode;
  validateConnection(): Promise<PosConnectionResult>;
  getLocation(externalLocationId?: string): Promise<PosLocation>;
  getMenuItems(externalLocationId: string): Promise<PosMenuItem[]>;
  getTickets(externalLocationId: string, range: PosTicketRange): Promise<PosTicket[]>;
  getEmployees?(externalLocationId: string): Promise<PosEmployee[]>;
  verifyWebhook?(rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhook?(rawBody: string): Promise<PosWebhookResult>;
}

export class PosProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosProviderUnavailableError";
  }
}
