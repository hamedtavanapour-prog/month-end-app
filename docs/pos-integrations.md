# POS integration foundation

## Boundary and architecture

Month End owns restaurants, products, menus, recipes, counts, purchases, actual usage, and variance. A POS is a read-only source of external sales facts.

```text
Omnivore API or mock fixtures
  -> PosIntegrationProvider / OmnivoreAdapter
  -> normalized POS tables and domain types
  -> confirmed POS-to-Month-End menu mapping
  -> existing Month End recipes and product links
  -> theoretical product usage with source traces
```

Provider code lives under `apps/web/src/lib/pos/providers`. The rest of the application consumes the provider-independent types in `apps/web/src/lib/pos/domain.ts`. Adding Toast, Square, or another provider should require a new adapter, not changes to recipe or inventory logic.

The live `OmnivoreAdapter` deliberately performs no HTTP calls yet. Credentials, an authorized location, and version-matched API documentation are required before endpoint paths, pagination, webhook authentication, or payload shapes are implemented.

This boundary follows Omnivore's published distinction between historical/current-day read-only and read/write integrations, its application/location authorization model, and its recommendation that reporting partners reconcile ticket data rather than rely only on webhooks:

- [Omnivore integration types](https://omnivoreapi.zendesk.com/hc/en-us/articles/22503060574619-Omnivore-Integration-Types)
- [Creating and authorizing an Omnivore application](https://omnivoreapi.zendesk.com/hc/en-us/articles/24670815972891-How-To-Create-An-Omnivore-Application)
- [Omnivore webhook operational guidance](https://omnivoreapi.zendesk.com/hc/en-us/articles/14087195851547-Webhooks)

## Existing Month End domain reuse

- `organizations` remains the restaurant/workspace tenant.
- Month End products, menus, recipe variants, recipe ingredients, counts, orders, and usage remain in `workspace_states.data` for this stage.
- POS menu IDs remain external records. Mappings store the stable Month End menu-item ID and recipe variant key; they do not duplicate or mutate menu records.
- Recipe expansion reads existing ingredient-to-product links. Conversion handles the recipe volume formats currently needed for the mock milestone; unsupported quantities are reported for review instead of guessed.
- Theoretical usage is calculated separately from existing actual usage and is not posted as an actual inventory deduction.

## Database changes

Migration `supabase/migrations/20260821041206_prepare_pos_integrations.sql` adds:

| Table | Purpose |
| --- | --- |
| `pos_integrations` | One provider connection per restaurant, mode/status/configuration, and sync health |
| `pos_locations` | Provider location identity and location-level sync health |
| `pos_menu_items` | Imported external menu catalog, kept separate from Month End menus |
| `pos_item_mappings` | Human-confirmed mapping state and Month End menu/variant references |
| `pos_tickets` | Idempotent normalized ticket headers and source hashes |
| `pos_ticket_items` | Normalized sold quantities, modifiers, void/cancel state, and external IDs |
| `pos_sync_runs` | Manual, scheduled, webhook, mock, and reconciliation run metrics |
| `integration_events` | Retained raw events for restricted audit, retries, and debugging; default retention is 90 days |

Composite foreign keys include `organization_id`, and update triggers make that tenant key immutable, so records cannot be connected or moved across restaurant tenants. Unique constraints on location/external IDs make menu and ticket imports idempotent. Raw JSON belongs only in restricted `integration_events`, not the normalized client-readable menu/ticket tables, and is never the business model. The connection configuration also rejects common secret-bearing keys as a database-level guardrail.

All tables use RLS. Owners/admins have full access through existing role helpers; managers/staff require explicit permission. Browser clients have no delete privilege, and anonymous clients have no access.

## Permissions and activity

The migration adds:

- `integrations.pos.view`
- `integrations.pos.manage`
- `integrations.pos.map`
- `integrations.pos.sync`
- `integrations.pos.errors`

The native settings page and every server action enforce these independently. View/map permissions are manager-assignable; connection management, sync, and error access are intentionally more restricted. Configuration, disconnect, menu import, mapping changes, sync success, and sync failure use the existing `record_app_event` audit RPC.

## Mock/test mode

Open **Settings → POS Integrations → Omnivore**, then:

1. Enable the mock connection.
2. Import the mock menu.
3. Map an external POS item to a Month End menu item and recipe size.
4. Synchronize sample tickets.
5. Review theoretical product usage and expand the source trace.

Mock records use stable IDs, so repeating imports exercises idempotent update/skip behavior. The UI always displays a prominent **TEST MODE** banner. No production connection is implied.

The fixture includes a ticket with ten Grey Goose Martinis, modifiers on a food item, employee metadata, and a voided cocktail line. Results depend on the restaurant's existing recipe/product links. For a mapped recipe containing 2 oz Grey Goose and 0.5 oz vermouth, ten sales produce 20 oz and 5 oz respectively.

## Ticket ingestion and theoretical usage

Ticket upserts use `(location_id, external_ticket_id)` and line upserts use `(ticket_id, external_ticket_item_id)`. A content hash classifies a ticket as created, updated, or unchanged. Duplicate external IDs in one provider response fail the sync before writes. Lines removed by an updated source ticket are retained and marked cancelled for auditability.

Calculation flow:

```text
eligible ticket item × sold quantity
  -> confirmed mapping
  -> Month End menu item + variant
  -> existing recipe ingredient
  -> linked inventory product
  -> canonical millilitres / displayed fluid ounces
```

Voided/cancelled/refunded tickets and lines do not count. Unmapped, ignored, needs-review, missing-recipe, unlinked-product, and unconvertible-quantity cases produce explicit issues. Each successful trace retains the database ticket and item IDs, external ticket ID/number, POS item, Month End menu item/variant, recipe ingredient/amount, product, and calculated amount.

## Synchronization and webhook preparation

Menu and ticket synchronization record timestamps, last success, errors, record counts, ranges, and trigger types. The same tables support a future scheduled reconciliation that fetches a bounded period and upserts missing or changed external IDs; webhooks are not the sole intended source of truth.

`POST /api/integrations/omnivore/webhook` is server-only, size-limited, and fails closed. With no credentials it returns `503`. Even when environment variables exist, it returns `501` until the real adapter can verify requests using confirmed Omnivore documentation. It does not persist unverified payloads. Once verification is known, verified events should be inserted into `integration_events` by their unique external event key, then parsed and sent through the same ticket ingestion service. Failed events can be replayed by incrementing `attempt_count` and updating processing status.

## Environment variables

These values are server-only and must never use a `NEXT_PUBLIC_` prefix:

```dotenv
OMNIVORE_API_KEY=
OMNIVORE_API_BASE_URL=
OMNIVORE_LOCATION_ID=
```

Leave them unset in mock mode. Secrets are not stored in `pos_integrations.configuration`; that JSON is limited to non-secret operational configuration.

## Replacing mock access with live Omnivore access

1. Obtain an Omnivore application API key and authorize the restaurant location.
2. Confirm the API version, base URL, endpoint paths, pagination, status/update semantics, rate limits, and webhook verification contract from authorized Omnivore documentation.
3. Implement those calls only inside `OmnivoreAdapter`, translating every payload into normalized POS domain types.
4. Add adapter contract tests using scrubbed fixtures; do not call a live POS in automated tests.
5. Enable live connection validation and location selection on the settings page.
6. Run a bounded historical reconciliation and compare counts/source records before enabling scheduled jobs or webhooks.

## Inventory movement ledger assessment

Current live inventory is derived from JSON count baselines, received orders, and recorded actual usage. A wholesale ledger migration would be risky at this stage, so none is introduced here.

A safe future migration is additive:

1. Add normalized `inventory_movements` and immutable source references without changing current reads.
2. Backfill count baselines, purchases, actual usage, waste, transfers, adjustments, returns, credits, and recount corrections with deterministic idempotency keys.
3. Run ledger projections beside existing live-inventory calculations and reconcile differences.
4. Switch reads only after per-restaurant parity and rollback testing.
5. Treat theoretical `SALE_USAGE` as a forecast/ideal stream or projection, distinct from actual inventory movements, until product policy explicitly decides otherwise.

Target movement types are `COUNT_BASELINE`, `PURCHASE_RECEIVED`, `SALE_USAGE`, `WASTE`, `TRANSFER_IN`, `TRANSFER_OUT`, `ADJUSTMENT`, `RETURN_TO_VENDOR`, `CREDIT`, and `RECOUNT_CORRECTION`.

## Verification

- `npm test` runs provider-independent unit/domain tests without a POS.
- `npm run typecheck`, `npm run lint`, and `npm run build` validate the application.
- `npx supabase test db supabase/tests/pos_integrations_rls.test.sql` verifies POS permissions and tenant isolation when local Supabase/Docker is available.
- Apply the migration to a non-production environment before exercising the full UI flow.

## Delivery boundary

### Completed and testable now

- Provider-independent POS contract and mock Omnivore adapter
- Tenant-scoped schema, RLS, permissions, audit calls, raw-source retention, sync history
- Mock menu/ticket ingestion with stable external IDs and update handling
- Manual mapping UI and traceable theoretical usage calculation
- Fail-closed webhook route architecture
- Domain and database test coverage

### Requires Omnivore credentials and location authorization

- Authenticated connection validation and location metadata
- Real menu, employee, ticket, and reconciliation HTTP calls
- Confirmed webhook signature/authentication and payload parsing
- Production rate-limit, pagination, and outage behavior validation

### Future work

- Scheduled reconciliation runner and verified webhook replay worker
- Mapping suggestions with mandatory human confirmation for uncertain matches
- Persisted reporting periods and actual-versus-ideal variance UI
- Additive inventory movement ledger migration
- Additional POS adapters
