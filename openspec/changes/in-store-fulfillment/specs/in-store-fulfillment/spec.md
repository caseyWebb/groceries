## ADDED Requirements

### Requirement: Shared store registry and schema

The system SHALL maintain a shared `stores/` tree at the data-repo root, one `stores/<slug>.toml` per **specific store location** (not per chain), holding objective store content read by every member. Each store SHALL carry: `slug` (required, kebab-case location id), `name` (required, e.g. "Tom Thumb"), `label` (optional human handle, e.g. "West 7th"), `chain` (optional), `address` (optional), `domain` (free string, default `grocery`), an ordered `[[aisles]]` list (each with a `number` or `label` plus a free-string `sections` array in the store's own sign vocabulary), `[[item_locations]]` (each `item` — a normalized ingredient name — plus `aisle` and optional `detail`), and `doesnt_carry` (string array). The schema SHALL be documented in `docs/SCHEMAS.md` and validated structurally at build time (`scripts/build-indexes.mjs`) and by the Worker's write-time subset. Store content is objective and **unattributed** (like recipe content). There SHALL be no `_indexes/stores.json` — the set is small and read directly. An absent `stores/` tree SHALL be valid (no stores mapped yet).

#### Scenario: Store conforms to schema

- **WHEN** a store is written to `stores/<slug>.toml`
- **THEN** it carries a `slug` and `name`, its `aisles` are an ordered list of `{ number|label, sections[] }`, and it passes structural validation

#### Scenario: item_location keys are normalized

- **WHEN** an `item_location` is recorded for "green onions" and aliases canonicalize that to "scallions"
- **THEN** the stored key uses the same `normalizeIngredient` the verify matcher applies, so a grocery-list line for either synonym resolves to that location

#### Scenario: Absent registry is valid

- **WHEN** no `stores/` tree exists
- **THEN** `list_stores` returns an empty set and build/write validation does not fail

### Requirement: Store CRUD tools

The system SHALL provide `list_stores()`, `read_store(slug)`, `add_store(...)`, `update_store(slug, operations)`, and `remove_store(slug)`. `read_store` SHALL return objective content only. `update_store` SHALL accept operations covering identity/aisle/section edits **and** the lazy facet growth (add or remove an `item_location`, add or remove a `doesnt_carry` entry) in one tool, operation-style like `update_pantry` / `update_kitchen`. Stores are shared corpus; any MCP holder MAY create or edit one with no extra gate (the `update_discovery_sources` posture). All mutations SHALL persist via the atomic commit engine and return structured results and errors.

#### Scenario: List returns mapped stores

- **WHEN** `list_stores` is called
- **THEN** it returns each store's `slug`, `name`, `label`, `domain`, and whether it has an aisle layout

#### Scenario: Unknown slug is a structured error

- **WHEN** `read_store`, `update_store`, or `remove_store` is called with an unknown slug
- **THEN** a structured `not_found` is returned rather than a throw

#### Scenario: Lazy facet growth via update_store

- **WHEN** `update_store` is called with an add-`item_location` operation
- **THEN** the location is appended to the store and committed atomically

### Requirement: Sparse item locations and not-carried set, grown from the walk

`item_locations` and `doesnt_carry` SHALL be sparse — capturing only non-obvious placements and surprising absences, never an exhaustive inventory. The walk SHALL be the primary capture path: when the user cannot find an item and then locates it, the agent SHALL **offer** (never silently write) to save its `item_location`; when a store does not carry an item, the agent SHALL offer to record it in `doesnt_carry`. Both are hints, never gates — a `doesnt_carry` entry MAY be cleared when the item is later found.

#### Scenario: Found-after-searching offers a save

- **WHEN** the user reports finding an item in an aisle other than where the agent guessed
- **THEN** the agent offers to save that `item_location` and writes it only on confirmation

#### Scenario: Not-carried is offered, not assumed

- **WHEN** the chosen store does not carry a listed item
- **THEN** the agent offers to record it in `doesnt_carry` and notes it for the trip, without auto-splitting the order

### Requirement: Attributed per-tenant store notes

The system SHALL store store notes per-tenant at `users/<id>/store_notes/<slug>.toml`, authored structurally (the path, unspoofable), append-mostly, shared-by-default with an optional `private` flag. `add_store_note(slug, body, private?)` SHALL append a note; `read_store_notes(slug)` SHALL return the caller's own private notes plus every member's shared notes, attributed — mirroring `read_recipe_notes`. Notes SHALL carry both objective ("fish counter closes at 6 PM") and personal ("they have the Kerrygold I like") observations; the agent SHALL NOT fold a note into the shared store content (notes stay attributed).

#### Scenario: Shared note is group-visible

- **WHEN** a member adds a non-private note "fish counter closes at 6 PM"
- **THEN** `read_store_notes` returns it, attributed to its author, for every member

#### Scenario: Private note is owner-only

- **WHEN** a member adds a note with `private: true`
- **THEN** it is returned only to its author and never surfaced to other members

### Requirement: Fulfillment mode and preferred store

`preferences.toml [stores].primary` SHALL accept either `kroger` (online mode — `place_order`, retaining `preferred_location` for the Kroger API) or a store slug (walk mode — the in-store flush). The agent SHALL select the flush from the resolved mode and SHALL NOT assume Kroger. Naming a store for a single trip SHALL override the standing preference for that trip only, without rewriting it. Mode is a property of the preference and trip, not the chain — a store MAY be online-capable and/or walk-capable.

#### Scenario: Walk-mode primary picks the in-store flush

- **WHEN** `primary` is a mapped store slug and the user asks to shop
- **THEN** the agent runs the in-store walk, not `place_order`

#### Scenario: Per-trip override leaves the preference intact

- **WHEN** the standing `primary` is `kroger` but the user says "I'm going to the West 7th Tom Thumb, give me a list"
- **THEN** the agent builds an in-store list for that store and does not change the stored `primary`

### Requirement: Aisle-ordered shopping list with graceful degradation

The in-store flush SHALL produce a shopping list ordered by the store's walk path and filtered to the store's `domain`. Item-to-aisle placement SHALL be agent judgment over the store's own section vocabulary and `item_locations` (open-vocabulary, no manifest — the storage-guidance posture). The list SHALL degrade gracefully: with no layout, a department-grouped list from general knowledge; with section tags only, a department-ordered walk; with a full aisle map, aisle-by-aisle; with `item_locations`, pinpointed tricky items. An exact `item_location` hit SHALL take precedence over inferred placement. Recipe attribution and the buy amount (the same need-aggregation `place_order` surfaces) SHALL ride each line so the shopper grabs enough.

#### Scenario: Empty layout still yields a usable list

- **WHEN** the chosen store has no aisle map
- **THEN** the agent returns a sensibly department-grouped list rather than refusing

#### Scenario: item_location pinpoints a tricky item

- **WHEN** a list item has a recorded `item_location`
- **THEN** that item is placed at its recorded aisle/detail, overriding category inference

#### Scenario: Domain filters the list

- **WHEN** the store's `domain` is `grocery`
- **THEN** `home-improvement`-tagged list items are excluded from that walk

### Requirement: The in-store walk — voice-first pacing, completion, and first-visit mapping

The store-walk skill SHALL run hands-free / voice-first, pacing one aisle at a time, advancing on "got it" and handling "can't find it" by disambiguating sold-out (transient, no layout change) vs. moved (offer an `item_location` update) vs. not-carried (offer a `doesnt_carry` entry). On the first visit to an unmapped store the agent SHALL **offer** to record the walkthrough (read the aisle signs into the layout) but SHALL NOT push it, proceeding with a degraded list if declined. On completion the skill SHALL advance picked `grocery`-kind items directly `active → received`, restocking the pantry and offering storage tips for fresh perishables — reusing the existing receive behavior, with no `in_cart` / `ordered` stage.

#### Scenario: Completion reuses the received behavior

- **WHEN** the user finishes the walk
- **THEN** picked `grocery`-kind items are removed from the list, their pantry entries are restocked, and storage tips are offered for fresh perishables

#### Scenario: First-visit mapping is offered, not pushed

- **WHEN** the user shops an unmapped store for the first time
- **THEN** the agent offers to record the aisle layout and, if declined, proceeds with a degraded list

#### Scenario: Can't-find is disambiguated before any write

- **WHEN** the user says "can't find it"
- **THEN** the agent asks whether the item is sold out, moved, or not carried, and only on "moved" or "not carried" offers to update the store
