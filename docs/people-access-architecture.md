# People & Access architecture

## Objective

Month's End is a multi-customer restaurant platform. Restaurant operational
authority must remain separate from platform administration, and access must be
limited by customer, region, location, department, and permission.

## Authority map

```text
Month's End platform
└── Platform administrator
    └── Customer organization
        ├── Organization administrator
        └── Region (optional)
            └── Regional manager
                └── Location
                    └── Location administrator / General Manager
                        └── Custom position
                            └── Member
```

System authority is a security ceiling. A custom position is a reusable set of
operational defaults and never grants authority outside that ceiling.

## User assignment

Each restaurant user can have:

- one customer membership;
- access to one or more regions and locations;
- one primary location;
- one or more custom positions, with one primary position;
- one primary department and additional departments;
- a supervisor per location;
- explicit permission exceptions;
- an active or suspended account state.

## Position inheritance

Positions can be organization-wide, regional, or location-specific. A position
defines default departments, permissions, and whether its holder may manage
people. Effective access is calculated in this order:

```text
system authority ceiling
→ customer/region/location scope
→ position defaults
→ department scope
→ explicit user exceptions
```

An exception may narrow access. It may expand access only when the assigning
person already has that access and the recipient's system authority permits it.

## Navigation decision

People & Access is a first-class application area, not an embedded Settings
panel. Settings may link to it, but the page uses the same application shell and
must not render through nested iframes.

```text
People & Access
├── Overview
├── People
├── Positions
├── Organization structure
├── Invitations
└── Activity
```

## Authentication decision

Normal sign-in requests only email and password. After authentication, one
available location opens automatically; users with several locations choose
from authorized locations or resume their last one. Invitation links carry the
customer and location context, so users never type a restaurant name.

Platform administration uses the same identity provider but a separate,
audited platform surface. Platform authority does not create an implicit
restaurant membership.

## Compatibility and rollout

1. Add the new scope and position tables without changing current behavior.
2. Map existing reporting relationships into the new reporting-line table.
3. Preview the customer, region, location, position, and department migration.
4. Add centralized effective-access functions and isolation tests.
5. Build the native People & Access experience.
6. Move invitations and membership updates to the new access functions.
7. Simplify login and add the authorized location selector.
8. Remove the embedded Users & Access frame.
9. Retire legacy roles only after every existing account is mapped and verified.

No production migration should run until the pgTAP isolation suite passes in a
disposable Supabase database and the existing customer data migration preview
has been reviewed.

## Required verification scenarios

- A platform administrator cannot read restaurant data without an explicit,
  audited support action or restaurant membership.
- An organization administrator can manage only their customer organization.
- A regional manager can access only assigned regions and locations.
- A General Manager can fully manage only assigned locations.
- A department manager can manage assigned departments and authorized reports.
- A member sees only assigned locations, departments, pages, and actions.
- Additional department access does not change the primary department or
  reporting line.
- Position changes show affected users and cannot exceed the editor's access.
- Suspended users cannot enter any customer workspace.
- Cross-customer identifiers fail at the database boundary.
