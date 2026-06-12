## Context

The agent has one fulfillment path: capture buy-intent into the SKU-free `grocery_list.toml`, then `place_order` resolves SKUs and writes the Kroger curbside/delivery cart. In-person trips have no path — a Kroger cart is useless when you're walking a Tom Thumb. Because the grocery list is already store-agnostic, the capture side is reusable as-is; what's missing is a second *flush* that produces a walking list ordered the way you actually move through a store.

This builds on established patterns in the repo: the shared-corpus / per-tenant split (recipes, SKU cache), the three-category recipe model (objective content vs. per-tenant overlay vs. attributed notes), agent-side open-vocabulary mapping with no manifest (storage-guidance), lazy data growth through use (`pairs_with`, the SKU cache, aliases), and the hands-free voice-first `cook` skill. Nearly every decision below is "apply the existing pattern," which is why the surface area is small.

## Goals / Non-Goals

**Goals:**
- A second flush — the `store-walk` skill — that orders the current grocery list by a store's aisles, voice-first, and ends by reusing the existing `received` (restock + storage-tips) behavior.
- A shared `stores/` registry that grows in value as the group maps stores, and is *useful with zero layout data* (graceful degradation).
- Sparse, low-maintenance enrichment (`item_locations`, `doesnt_carry`) that grows lazily from the walk itself.
- Fulfillment mode as a per-tenant preference, so the agent stops hardcoding Kroger.
- A `domain` facet wired through now so non-grocery stores (Lowe's, Target) generalize later for free.

**Non-Goals (v1):**
- Cross-store routing / split trips (needs multiple mapped stores + a `known_for` facet) — follow-on.
- Building out the non-grocery skill surface — the schema accommodates it; the agent copy stays grocery-shaped.
- Unifying the Kroger location config into `stores/`; chain-level data sharing.
- Real-time stock, in-store inventory APIs, or aisle data from any vendor — all layout is user-captured.
- Renaming `grocery_list.toml` (the slight misnomer is cheaper than the break).

## Decisions

### D1 — Fork the flush, not the pipeline
Capture (`meal-plan`, ad-hoc adds, `pantry_low`, `stockup`, `for_recipes`, quantities) is untouched. `place_order` remains the Kroger flush. The in-store flush is a new skill reading the same `grocery_list.toml`. *Why:* the list is already SKU-free and store-free; the only Kroger-specific stage was resolution+cart, which is exactly what the walk replaces. Alternative (a store-aware list at capture time) was rejected — it would couple items to stores prematurely and bloat the capture flow.

### D2 — The walk is a skill over read tools, not a new flush *tool*
No `build_shopping_list` tool. Aisle ordering is open-vocab categorization (agent judgment, like storage-guidance's class mapping — no manifest). The completion side effects go through **existing** tools (`update_grocery_list` lifecycle, `update_pantry` restock, `commit_changes`). *Why:* `place_order` earns toolhood because the cart write + SKU-cache is a real side-effecting pipeline; the walk has no deterministic core worth wrapping. This matches the storage-guidance precedent (read tools + agent reasoning, no compute tool) and keeps the new *tool* surface to the `stores/` CRUD only.

### D3 — Graceful degradation: layout is upside, never a precondition
Item placement degrades across four rungs: (0) no store → flat or department-grouped from world knowledge; (1) section tags only → department-grouped walk order; (2) full aisle map → aisle-by-aisle; (3) + `item_locations` → pinpointed tricky items. *Why:* the agent already does open-vocab categorization reliably; forcing a complete layout before the feature works would kill adoption. v1 ships rung 0 with zero data, and mapping is pure accrual. The agent maps an ingredient to a store's **own** section labels (the sign vocabulary), not a global enum — every store's signs differ.

### D4 — Shared `stores/`, one TOML per store, keyed by location
New shared top-level `stores/<slug>.toml` (e.g. `west-7th-tom-thumb.toml`), keyed by **specific location**, not chain. Holds objective content only: identity (`slug`, `name`, `label`, `chain?`, `address?`, `domain`), an ordered `[[aisles]]` list (each `number`/`label` + free-string `sections`), `[[item_locations]]` (`item`, `aisle`, `detail`), and `doesnt_carry` (string array). *Why one file:* a store's objective content is small and cohesive (recipes are one file each for the same reason); notes live elsewhere (D6). *Why no `_indexes/stores.json`:* a group has a handful of stores — `list_stores` reads the directory directly, the same call made for `ready_to_eat` (no index). Stores are shared like recipes; any MCP holder can map one (same posture as `update_discovery_sources` — no extra gate). Content edits are objective and **unattributed** (like recipe *content*).

### D5 — `item_locations` & `doesnt_carry`: sparse by design, grown lazily
Both are *negative-space* data — you record only the surprising stuff (where the tahini hides; that they don't carry harissa). You never map where milk is. *Why this is the crux of maintainability:* a full "what's where" map is infeasible to keep current; a sparse "here are the three weird ones" set is near-zero effort and high value. The capture trigger is the walk's friction moment: "can't find it" → "oh, aisle 9" → the skill *offers* to remember it (`update_store`). This mirrors how `pairs_with` and the SKU cache grow — never a chore, always a side effect of normal use. `item` keys are normalized with the **same `normalizeIngredient` + aliases** the verify matcher uses, so "scallions"/"green onions" resolve to one hint.

### D6 — Store notes = the recipe-notes pattern, verbatim
Attributed notes live per-tenant at `users/<id>/store_notes/<slug>.toml` (structural authorship — the path, unspoofable), append-mostly, shared-by-default with optional `private`, aggregated across members at read time. *Why reuse it wholesale:* a store note is both objective ("fish counter closes at 6 PM") and personal ("they have the Kerrygold I like"); the recipe-notes model already handles exactly this mix (attributed, shareable, private-able) and the aggregation code (`src/notes*.ts`, `read_recipe_notes`) exists. Objective *structured* facts go in the shared store (D4/D5); freeform observations are notes. `read_store_notes(slug)` returns the caller's own private notes + everyone's shared notes, like `read_recipe_notes`.

### D7 — `store-walk` is a sibling of `cook`; completion reuses `received`
The skill mirrors `cook`: hands-free, one aisle at a time, advance with "got it" / "can't find it", optional voice mode. It resolves the store from the trip ("I'm going to the West 7th Tom Thumb") or the preferred-store preference, reads `grocery_list` + `read_store` + `read_store_notes` (batched), places items across aisles (D3), and paces the walk. On completion it advances picked `grocery`-kind items straight to `received` (restock pantry) and offers storage tips — the **same** behavior `place_order`'s receive path already implements, now shared by both flushes. *Why:* the receive→restock→storage-tips logic is fulfillment-agnostic; duplicating it would drift. The in-store lifecycle is `active → received` directly (no `in_cart`/`ordered` — those are cart-specific). "Can't find it" disambiguates gently: sold-out (transient, no layout change), moved (offer to update `item_location`), or not-carried (offer to add to `doesnt_carry`, the seed for future cross-store routing).

### D8 — Fulfillment mode is a per-tenant preference; mode ⟂ chain
`preferences.toml [stores].primary` may be a store slug (→ walk mode) or `kroger` (→ online mode, keeping `preferred_location` for the Kroger API). The agent picks the flush from the resolved mode; naming a store for one trip overrides it. *Why orthogonal to chain:* a store can be online-capable (a Kroger `locationId`) and/or walk-capable (has a layout). Modeling mode as a property of the *preference/trip*, not the chain, leaves the door open to walking a Kroger or (later) unifying `[stores]` — without committing to it now.

### D9 — `domain` facet now, non-grocery surface later
Add `domain` (free string; common set `grocery` | `home-improvement` | `garden` | `pharmacy`; default `grocery`) to grocery-list items and to stores. The walk filters the list to the store's domain. *Why a string, not a hard enum:* non-grocery categories are open-ended (the user's own uncertainty), and a wrong tag only mis-files an item. *Why build the facet but not the surface:* the cost is one optional field + filter; it makes the walk machinery domain-agnostic so a Lowe's run is "just another store," but the agent copy and any non-grocery flows are deferred. The cleaning-supplies overlap is handled by tagging such items `grocery` while the agent may *offer* to move bulk items to a hardware run.

### Tool surface (net-new)
Reads: `list_stores()`, `read_store(slug)` (objective content), `read_store_notes(slug)` (attributed). Writes: `add_store(...)`, `update_store(slug, operations)` (identity/aisle/section edits **and** the lazy `item_location`/`doesnt_carry` growth via operations — one tool, `update_pantry`/`update_kitchen` style), `remove_store(slug)`, `add_store_note(slug, body, private?)`. Structured errors per `src/errors.ts`; `docs/TOOLS.md` updated in the same pass.

## Risks / Trade-offs

- **Layout quality gates walk quality** → graceful degradation (D3) means a coarse/empty layout still produces a usable department list; precision is opt-in and accrues. No hard failure from missing data.
- **Voice-mode walk is a long conversation; a dropped session loses "picked" state** → v1 keeps picked-ness in the conversation and batches the `received` transition at completion (like `cook` not persisting per-step state). Acceptable for v1; persistent per-item "picked" state is a possible later refinement, not built now.
- **`grocery_list.toml` name vs. a home-improvement item** → accepted misnomer (D9); renaming is a larger break for little gain. Documented.
- **Open-vocab placement can mis-file an item** → low stakes (you glance one aisle over); "can't find it" feeds a correction back into `item_locations`, so errors are self-healing.
- **Store-note attribution adds a per-tenant subtree** → reuses the recipe-notes machinery and validation; near-zero net new code, and the structural-authorship guarantee is worth it.
- **`doesnt_carry` could go stale** (a store starts carrying it) → it's a hint, never a gate; a found item during a walk can clear its entry. Same "speed-cache, revalidate in use" posture as the SKU cache.

## Migration Plan

Additive — no data migration. New shared `stores/` and per-tenant `store_notes/` start empty (absent = "no stores mapped," which the walk handles as rung 0). `domain` is optional with a `grocery` default, so existing `grocery_list.toml` items validate unchanged. `[stores].primary` keeps working as `kroger` for everyone until a member sets a store slug. Ship order: (1) Worker store modules + tools + validation; (2) `domain` plumbing + generalized `received`; (3) `AGENT_INSTRUCTIONS.md` `store-walk` flow + mode-aware flush + rebuild plugin; (4) docs. Rollback is removing the tools/skill — no destructive schema change to undo.

## Open Questions

- **Per-item "picked" persistence** for resilient long voice walks — deferred; batch-at-completion for v1 (noted above).
- **Cross-store routing shape** (`known_for` facet vs. inferring from `doesnt_carry` + others' layouts) — deferred to the follow-on; `doesnt_carry` is captured now as its seed.
- **Whether `read_store` should fold in a notes summary** to save a round-trip on the latency-sensitive walk — starting with separate `read_store` / `read_store_notes` (recipe parity); the walk batches both. Revisit if voice latency warrants.
