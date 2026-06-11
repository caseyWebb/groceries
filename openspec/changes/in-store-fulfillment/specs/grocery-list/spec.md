## MODIFIED Requirements

### Requirement: Grocery list file and schema

The system SHALL maintain `grocery_list.toml` at the repo root as an ingredient-level, **SKU-free** buy list of committed buy-intent that accumulates across a week. Each item SHALL carry: `name` (required, the order-time search term), `quantity` (loose buy amount, same looseness as pantry), `kind` (`grocery` | `household` | `other`, default `grocery`), `domain` (free string identifying the kind of store it's bought at — common values `grocery` | `home-improvement` | `garden` | `pharmacy`; default `grocery`), `status` (`active` | `in_cart` | `ordered`, required), `source` (`ad_hoc` | `menu` | `pantry_low` | `stockup`), `for_recipes` (recipe slugs; may be empty), `note` (freeform or null), `added_at` (ISO date, required), and `ordered_at` (ISO date or null). The schema SHALL be documented in `docs/SCHEMAS.md`, and the file SHALL be an agent-writable side-effect file (not user-curated config). Items SHALL NOT store a resolved Kroger SKU — resolution is deferred to order time (Change 06b). `domain` is orthogonal to `kind`: `kind` governs pantry reconcile on receive, `domain` governs which store-type a walk includes the item in.

#### Scenario: Item conforms to schema

- **WHEN** an item is written to `grocery_list.toml`
- **THEN** it carries a `name`, a `status` from the legal set, an `added_at` date, and no resolved SKU, and it passes structural validation

#### Scenario: Non-food item is representable

- **WHEN** a household item such as "paper towels" is added
- **THEN** it is stored with `kind = "household"` and is not tied to any recipe or pantry entry

#### Scenario: Domain defaults to grocery

- **WHEN** an item is added with no `domain` supplied
- **THEN** it is stored with `domain = "grocery"` and validates unchanged (existing items without a `domain` are read as `grocery`)

#### Scenario: Non-grocery item carries its domain

- **WHEN** a "2x4 lumber" item is added with `domain = "home-improvement"`
- **THEN** it is stored with that domain, included in an in-store walk for a `home-improvement` store, and excluded from a `grocery` walk
