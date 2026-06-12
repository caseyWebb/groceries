## Why

The agent assumes one fulfillment path: capture intent → `place_order` → Kroger curbside/delivery cart. But plenty of trips are walked in person, and a Kroger cart is useless when you're standing in a Tom Thumb. The grocery list is already SKU-free and store-agnostic, so the capture side needs no change — we only need a **second flush**: a walking shopping list organized by the store's aisles. And because store layout is shared, one person mapping the West 7th Tom Thumb once pays off for the whole group (the same network effect as the recipe corpus and the SKU cache).

## What Changes

- **A second flush path — the in-store walk.** A new `store-walk` skill turns the current grocery list into an aisle-ordered shopping list for a named store, hands-free/voice-first (a sibling of the `cook` skill: one aisle at a time, "got it" / "can't find it"). On completion it converges on the **existing** `received` behavior (restock the pantry for `grocery`-kind items, offer storage tips). The Kroger `place_order` flush is unchanged.
- **A shared `stores/` registry.** New top-level shared data, keyed by specific location slug (`west-7th-tom-thumb`, not chain): identity + an **aisle layout** captured in the store's own sign vocabulary, plus two sparse, high-value facets — **`item_locations`** (where the *non-obvious* items hide) and **`doesnt_carry`** (a small negative set). New CRUD tools: `list_stores`, `read_store`, `add_store`, `update_store`, `remove_store`, plus narrow writes for the lazy facets.
- **Attributed store notes.** Per-tenant, structural-authorship notes (`users/<id>/store_notes/<slug>.toml`), shared-by-default with optional `private`, aggregated at read time — exactly the recipe-notes pattern. Carries both objective ("fish counter closes at 6 PM") and personal ("they have the Kerrygold I like") observations.
- **Graceful degradation, not a precondition.** Item placement is open-vocabulary categorization done by the agent (the storage-guidance posture — no manifest). A store with *no* layout still yields a department-grouped list from world knowledge; an aisle map upgrades it to aisle-by-aisle; `item_locations` pinpoint the tricky stuff. Layout is pure upside that accrues through use — the "can't find it → oh, aisle 9" moment is the capture trigger (offer to remember it, like `pairs_with` and the SKU cache).
- **Fulfillment mode is a per-tenant preference.** `preferences.toml [stores].primary` may be a store slug (→ walk mode) or `kroger` (→ online mode, keeping `preferred_location`). Mode is orthogonal to chain — a store can be online-capable and/or walk-capable; the preference picks the flush, and naming a store for a single trip overrides it. The agent stops assuming Kroger.
- **A `domain` facet** (`grocery` | `home-improvement` | …, default `grocery`) on both grocery-list items and stores. The walk filters the list to the store's domain. Built now (cheap) so the walk machinery is domain-agnostic and a Lowe's/Target run generalizes for free later — but the non-grocery skill surface is **not** built in v1.

**Out of scope (follow-ons, noted in design):** cross-store routing (`doesnt_carry` → another store that carries it; a `known_for` cheapest-X facet → suggest a split trip); folding the Kroger location config into `stores/` to unify `[stores]`; chain-level data sharing.

## Capabilities

### New Capabilities
- `in-store-fulfillment`: the shared `stores/` data model (registry, aisle layout, `item_locations`, `doesnt_carry`) and its CRUD tools; attributed per-tenant store notes; the fulfillment-mode / preferred-store preference; and the `store-walk` skill (graceful-degradation aisle list, voice mode, lazy layout refinement, completion advancing items to `received`).

### Modified Capabilities
- `grocery-list`: each item gains an optional `domain` facet (default `grocery`); the CRUD tools accept it and the schema is documented in `docs/SCHEMAS.md`. No other field or lifecycle change.
- `order-placement`: the terminal `received` behavior (advance items, restock the pantry for `grocery`-kind items, offer storage tips) is generalized to be **fulfillment-mode-agnostic** — shared by the Kroger flush and the in-store walk — and the lifecycle acknowledges the walk's direct `active → received` completion (no `in_cart` / `ordered` for a walked trip).

## Impact

- **Worker (`src/`):** new `stores/` read/write modules + tool registrations (`list_stores`/`read_store`/`add_store`/`update_store`/`remove_store` and the lazy facet writes); store-note read/write reusing the notes aggregation machinery (`src/notes*.ts`); item-name normalization reused from the verify matcher (`normalizeIngredient` + aliases) so location hints line up; `domain` plumbed through the grocery-list write path.
- **Data model (shared + per-tenant):** new shared `stores/` tree; new per-tenant `users/<id>/store_notes/`; `grocery_list.toml` items gain `domain`; `preferences.toml [stores]` gains walk-mode `primary`. Build-time validation (`scripts/build-indexes.mjs`) and the Worker's structural subset both learn the new shapes.
- **Persona (`AGENT_INSTRUCTIONS.md`, the canonical plugin source):** a new `store-walk` flow skill (sibling to `cook` / `place-grocery-order`); a store-mapping/recording sub-flow (first-visit "want to record the walkthrough?" — offered, never pushed); and edits so the agent selects the flush by fulfillment mode instead of hardcoding Kroger. Rebuild via `npm run build:plugin`.
- **Docs (the contract):** `docs/TOOLS.md` (new store tools), `docs/SCHEMAS.md` (`stores/`, `store_notes/`, `domain`, extended `[stores]`), and `docs/PROJECT.md` (the two-flush model) updated in the same pass.
- **No new external dependencies, no new secrets.** Reuses GitHub-App writes, the commit engine, and the notes/aliases machinery already in place.
