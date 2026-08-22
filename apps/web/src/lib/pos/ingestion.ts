export type IncomingTicketIdentity<T> = {
  externalId: string;
  contentHash: string;
  value: T;
};

export type StoredTicketIdentity = {
  externalId: string;
  contentHash: string | null;
};

export function planTicketIngestion<T>(
  incoming: IncomingTicketIdentity<T>[],
  stored: StoredTicketIdentity[],
) {
  const unique = new Map<string, IncomingTicketIdentity<T>>();
  const duplicateExternalIds = new Set<string>();
  incoming.forEach((ticket) => {
    if (unique.has(ticket.externalId)) duplicateExternalIds.add(ticket.externalId);
    unique.set(ticket.externalId, ticket);
  });
  const storedById = new Map(stored.map((ticket) => [ticket.externalId, ticket]));
  const values = [...unique.values()];
  return {
    unique: values,
    duplicateExternalIds: [...duplicateExternalIds].sort(),
    created: values.filter((ticket) => !storedById.has(ticket.externalId)),
    updated: values.filter((ticket) => {
      const current = storedById.get(ticket.externalId);
      return Boolean(current && current.contentHash !== ticket.contentHash);
    }),
    skipped: values.filter((ticket) => storedById.get(ticket.externalId)?.contentHash === ticket.contentHash),
  };
}
