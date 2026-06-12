## Why

The `store-walk` skill conflated three jobs into one linear flow — *displaying* the list, *walking* it, and *mapping* an unfamiliar store — so none of them is a clean front door. Asking "what's on my list?" shouldn't drop you into a hands-free aisle walk, and offering to map a new store shouldn't be a buried sub-step of that walk. At the same time, the store layout is the one place the system broke its own "agent judgment over open vocabulary, no manifest" posture: it stores a structured `aisles[]` / `item_locations[]` / `doesnt_carry[]` model alongside a parallel free-form store-notes system describing the same store. Two systems, one subject.

## What Changes

- **Split `store-walk` into two skills.**
  - **`shopping-list`** — display-first and read-only until you commit to walking. Reads the grocery list and groups it by a degradation ladder: **department** (no store/layout known) → **aisle** (a mapped store). It filters to a named store's `domain` (say "Lowe's" → show only `home-improvement` items, department-grouped); proactively nudges when a mapped store fits the list's domain but wasn't named ("heading to West 7th Tom Thumb? I'll group by aisle"); displays the **whole** list; and **only if** layout is known, offers to enter voice step-by-step mode — which walks it and ends in `received`.
  - **`map-grocery-store`** — the mapping flow, offered (never pushed) when shopping an unmapped store, running *alongside* the trip. Aisle by aisle off the end-cap signs, it appends one layout note per aisle (saved as you go), reminds you to grab matching list items, and owns the `received` completion.
- **Collapse store layout into attributed notes (notes-only).** Remove the structured `aisles` / `item_locations` / `doesnt_carry` facets and the five `update_store` ops that maintained them. Aisle layout, where-it-hides locations, and not-carried entries all become **tagged store notes** (`layout` / `location` / `stock`), read in the single `read_store_notes` call that already surfaces hours/parking/personal observations. Mapping = a stream of `add_store_note` calls (append-only, auto-committing — "save as you go" for free, no clobber risk).
- **Keep a slim store registry.** `stores/<slug>.toml` survives as **identity only** (name, label, chain, address, `domain`); `add_store` / `read_store` / `list_stores` / `remove_store` stay; `update_store` keeps identity edits and loses its five layout ops. `list_stores`' `has_layout` flag becomes `has_notes`.
- **Add note edit/delete (`remove` + `update`, recipe and store).** New `remove_store_note` / `update_store_note` and `remove_recipe_note` / `update_recipe_note`, keyed by a note's millisecond-precision `created_at` and **self-scoped by structural authorship** (you can only touch notes in your own subtree). This recovers clean correction for the dominant case (re-mapping your own store); a *different* tenant's stale note still supersedes by recency at read. **BREAKING** to the "notes are append-only" contract — notes are now editable/removable by their author.

## Capabilities

### New Capabilities
<!-- none — every change refines an existing capability -->

### Modified Capabilities
- `in-store-fulfillment`: store registry slimmed to identity; the structured aisle layout / `item_locations` / `doesnt_carry` model is **removed** and its role moves to attributed store notes (tag convention); store-note edit/delete added; the `store-walk` skill is re-cut into a display-first `shopping-list` (grouping ladder, domain filter, proactive store nudge, gated voice-walk offer) and a `map-grocery-store` mapping flow (per-aisle layout notes, owns `received`). **Sequencing:** this capability is not yet canonical in `openspec/specs/` — its source `in-store-fulfillment` change (32/33) must archive **before or alongside** this one so the delta has a base.
- `recipe-notes`: an author MAY edit or delete their **own** notes (the shared note-mutation core, exposed for recipe notes as well as store notes) — relaxing the prior append-only constraint.

## Impact

- **Worker (`src/`):** `stores.ts` (drop the three layout facets from `Store` + parse/serialize + the five ops in `applyStoreOperations`; parser must *silently ignore* legacy `aisles`/`item_locations`/`doesnt_carry` keys, never error); `stores-tools.ts` (`update_store` → identity ops only; `list_stores` `has_layout` → `has_notes`; descriptions); `notes.ts` (shared pure `removeNote` / `updateNote` keyed by `created_at`); `notes-tools.ts` (register `remove_store_note` / `update_store_note` / `remove_recipe_note` / `update_recipe_note`; rewrite `add_store_note`'s description — layout/location/stock are now notes, with the tag convention).
- **Persona (`AGENT_INSTRUCTIONS.md`, canonical plugin source):** replace the one `store-walk` flow with two (`shopping-list`, `map-grocery-store`); fix the two-flush cross-references; rebuild via `npm run build:plugin`.
- **Docs (the contract):** `docs/TOOLS.md` (`update_store` ops, the four new note tools, `add_store_note` role), `docs/SCHEMAS.md` (drop the three layout facets from `stores/`; document the store-note tag convention and note mutability), and `docs/ARCHITECTURE.md` if it leans on aisle structure — updated in the same pass.
- **Data migration:** confirm the live data repo has no `stores/*.toml` carrying real aisle data before removing the parse; graceful-ignore parsing makes the teardown safe regardless.
- **No new external dependencies, no new secrets.** Reuses the notes aggregation, the store registry, the commit engine, and the existing mode-agnostic `received` behavior (`order-placement`), which both skills converge on unchanged.
