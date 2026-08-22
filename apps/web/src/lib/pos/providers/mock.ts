import type { PosIntegrationProvider, PosMenuItem, PosTicket, PosTicketRange } from "../domain";

const location = {
  externalId: "mock-location-001",
  name: "Month End Test Restaurant",
  timezone: "America/Toronto",
  metadata: { fixture: "month-end-pos-v1" },
};

const menuItems: PosMenuItem[] = [
  { externalId: "mock-item-grey-goose-martini-2oz", name: "GREY GOOSE MARTINI 2OZ", category: "Cocktails", sku: "GG-MART-2", price: 17, currency: "CAD", isActive: true },
  { externalId: "mock-item-old-fashioned", name: "OLD FASHIONED", category: "Cocktails", sku: "OLD-FASH", price: 16, currency: "CAD", isActive: true },
  { externalId: "mock-item-steakhouse-caesar", name: "STEAKHOUSE CAESAR", category: "Cocktails", sku: "CAESAR-STK", price: 15, currency: "CAD", isActive: true },
  { externalId: "mock-item-side-fries", name: "SIDE FRIES", category: "Food", sku: "SIDE-FRIES", price: 7, currency: "CAD", isActive: true },
];

function timestamp(range: PosTicketRange, minutesBeforeEnd: number) {
  return new Date(Math.max(range.from.getTime(), range.to.getTime() - minutesBeforeEnd * 60_000)).toISOString();
}

function tickets(range: PosTicketRange): PosTicket[] {
  return [
    {
      externalId: "mock-ticket-1001",
      ticketNumber: "1001",
      status: "closed",
      openedAt: timestamp(range, 100),
      closedAt: timestamp(range, 80),
      updatedAt: timestamp(range, 79),
      employee: { externalId: "mock-employee-01", name: "Alex Manager" },
      guestCount: 4,
      subtotal: 177,
      total: 199.99,
      currency: "CAD",
      items: [
        { externalId: "mock-ticket-1001-line-1", externalMenuItemId: "mock-item-grey-goose-martini-2oz", name: "GREY GOOSE MARTINI 2OZ", quantity: 10, unitPrice: 17, total: 170 },
        { externalId: "mock-ticket-1001-line-2", externalMenuItemId: "mock-item-side-fries", name: "SIDE FRIES", quantity: 1, unitPrice: 7, total: 7, modifiers: [{ externalId: "mock-mod-ketchup", name: "Ketchup", quantity: 1 }] },
      ],
    },
    {
      externalId: "mock-ticket-1002",
      ticketNumber: "1002",
      status: "closed",
      openedAt: timestamp(range, 65),
      closedAt: timestamp(range, 44),
      updatedAt: timestamp(range, 43),
      employee: { externalId: "mock-employee-02", name: "Jordan Server" },
      guestCount: 2,
      subtotal: 62,
      total: 70.06,
      currency: "CAD",
      items: [
        { externalId: "mock-ticket-1002-line-1", externalMenuItemId: "mock-item-old-fashioned", name: "OLD FASHIONED", quantity: 2, unitPrice: 16, total: 32 },
        { externalId: "mock-ticket-1002-line-2", externalMenuItemId: "mock-item-steakhouse-caesar", name: "STEAKHOUSE CAESAR", quantity: 2, unitPrice: 15, total: 30 },
        { externalId: "mock-ticket-1002-line-3", externalMenuItemId: "mock-item-old-fashioned", name: "OLD FASHIONED", quantity: 1, unitPrice: 16, total: 16, voided: true },
      ],
    },
  ];
}

export class MockPosAdapter implements PosIntegrationProvider {
  readonly provider = "omnivore";
  readonly mode = "mock";

  async validateConnection() {
    return { ok: true, mode: this.mode, message: "Mock Omnivore connection is ready.", location } as const;
  }

  async getLocation() {
    return location;
  }

  async getMenuItems() {
    return menuItems.map((item) => ({ ...item, raw: { fixture: true, external_id: item.externalId } }));
  }

  async getTickets(_externalLocationId: string, range: PosTicketRange) {
    return tickets(range).map((ticket) => ({ ...ticket, raw: { fixture: true, external_id: ticket.externalId } }));
  }

  async getEmployees() {
    return [
      { externalId: "mock-employee-01", name: "Alex Manager" },
      { externalId: "mock-employee-02", name: "Jordan Server" },
    ];
  }
}

export const mockPosFixtures = { location, menuItems, tickets };
