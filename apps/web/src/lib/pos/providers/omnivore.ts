import "server-only";

import type {
  PosEmployee,
  PosIntegrationProvider,
  PosLocation,
  PosMenuItem,
  PosTicket,
  PosTicketRange,
  PosWebhookResult,
} from "../domain";
import { PosProviderUnavailableError } from "../domain";

type OmnivoreEnvironment = {
  apiKey?: string;
  baseUrl?: string;
  locationId?: string;
};

function unavailable() {
  return new PosProviderUnavailableError(
    "Live Omnivore access requires confirmed credentials, location authorization, and version-matched API documentation.",
  );
}

export class OmnivoreAdapter implements PosIntegrationProvider {
  readonly provider = "omnivore";
  readonly mode = "live";

  constructor(private readonly environment: OmnivoreEnvironment = {
    apiKey: process.env.OMNIVORE_API_KEY,
    baseUrl: process.env.OMNIVORE_API_BASE_URL,
    locationId: process.env.OMNIVORE_LOCATION_ID,
  }) {}

  async validateConnection() {
    const configured = Boolean(this.environment.apiKey && this.environment.baseUrl && this.environment.locationId);
    return {
      ok: false,
      mode: this.mode,
      message: configured
        ? "Credentials are present, but live requests remain disabled until the authorized Omnivore API contract is confirmed."
        : "Omnivore credentials and location authorization are not configured.",
    } as const;
  }

  async getLocation(): Promise<PosLocation> {
    throw unavailable();
  }

  async getMenuItems(): Promise<PosMenuItem[]> {
    throw unavailable();
  }

  async getTickets(_externalLocationId: string, _range: PosTicketRange): Promise<PosTicket[]> {
    void _externalLocationId;
    void _range;
    throw unavailable();
  }

  async getEmployees(): Promise<PosEmployee[]> {
    throw unavailable();
  }

  async verifyWebhook() {
    return false;
  }

  async parseWebhook(): Promise<PosWebhookResult> {
    throw unavailable();
  }
}
