## 1. Note mutation core + tools (shared by recipe and store notes)

- [x] 1.1 Add pure `removeNote(notes, created_at)` and `updateNote(notes, created_at, patch)` to `src/notes.ts` — match by `created_at`, return `{ notes, found }` (no throw on miss); `updateNote` patches only provided fields (`body`/`tags`/`private`)
- [x] 1.2 Unit-test `removeNote`/`updateNote` against plain objects: found, not-found (no-op), partial patch, tags/private toggle, multiple notes same slug
- [x] 1.3 Register `remove_store_note(slug, created_at)` and `update_store_note(slug, created_at, body?, tags?, private?)` in `src/notes-tools.ts` — write via the caller's prefixed client (`personalGh`) so they only touch the caller's subtree; auto-commit; structured `not_found` when no own-note matches
- [x] 1.4 Register `remove_recipe_note` / `update_recipe_note` on the same shared core (recipe path)
- [x] 1.5 Rewrite `add_store_note`'s description: store notes are now the home of layout too — document the `layout` / `location` / `stock` tag convention (lead `layout` bodies with the aisle number); drop the "objective structured facts belong in `update_store`" steer

## 2. Slim the store model (remove structured layout)

- [x] 2.1 `src/stores.ts`: drop `aisles` / `item_locations` / `doesnt_carry` from the `Store` interface, `toStore`, and `serializeStore`; the parser MUST silently ignore those legacy keys if present (treat as absent), never error
- [x] 2.2 `src/stores.ts`: remove `set_aisles` / `add_item_location` / `remove_item_location` / `add_doesnt_carry` / `remove_doesnt_carry` from `StoreOperation` and `applyStoreOperations`; keep identity (`set_identity`)
- [x] 2.3 `src/stores-tools.ts`: `update_store` accepts identity ops only — a removed layout op returns a structured validation/conflict and writes nothing; rewrite the op descriptions
- [x] 2.4 `src/stores-tools.ts`: `list_stores` returns `has_notes` (does the store have `layout`-tagged notes) in place of `has_layout`
- [x] 2.5 `scripts/build-indexes.mjs`: update the structural store validation to the identity-only shape (drop the layout-facet checks; tolerate legacy keys)
- [x] 2.6 Update/trim `test/` store coverage: drop the five layout-op tests; add legacy-keys-ignored, identity-only `update_store`, and `has_notes` cases

## 3. Re-cut the agent persona (`AGENT_INSTRUCTIONS.md`)

- [x] 3.1 Replace the `store-walk` flow with a `shopping-list` flow: display-first; department→aisle grouping ladder (aisle inferred from `layout` notes); `domain` filter (named different-category store → only that domain's items, department-grouped, no voice offer); proactive "heading to X?" nudge for an unnamed mapped store; display the whole list; offer voice step-by-step **only** when layout is known; the voice walk ends in `received`
- [x] 3.2 Add a `map-grocery-store` flow: offered (never pushed) at an unmapped store; runs alongside the trip; aisle-by-aisle off the end-cap signs → `add_store_note(tags:["layout"])` per aisle, committed as you go; remind to grab matching list items + offer a `location` note; owns the `received` completion
- [x] 3.3 Fix the two-flush cross-references elsewhere in the doc (every mention of `store-walk` → `shopping-list` / `map-grocery-store`), keeping the capture-vs-flush framing intact
- [x] 3.4 `npm run build:plugin` (or `--check`) — verify the two new skills emit, `store-walk` is gone, and the prerequisite/`needs: cart` markers carry over

## 4. Docs (the contract — same pass)

- [x] 4.1 `docs/TOOLS.md`: `update_store` identity-only ops; the four new note tools (`update`/`remove` × store/recipe); the revised `add_store_note` role + tag convention; `list_stores` `has_notes`
- [x] 4.2 `docs/SCHEMAS.md`: drop the three layout facets from the `stores/` schema; document the store-note `layout`/`location`/`stock` tag convention and that notes are now author-mutable; note the legacy-key tolerance
- [x] 4.3 `docs/ARCHITECTURE.md`: update the in-store-walk / store-knowledge section if it describes the structured aisle layout (point it at notes-as-layout)

## 5. Verify and land

- [x] 5.1 Migration check: confirm the live operator data repo has no `stores/*.toml` carrying real `aisles`/`item_locations`/`doesnt_carry` (graceful-ignore parse makes the teardown safe either way)
- [x] 5.2 `npm test` + typecheck + `build:plugin --check` all green
- [x] 5.3 Archive ordering: ensure the `in-store-fulfillment` change archives **before or together with** this one, so this delta's MODIFIED/REMOVED requirements have a canonical base
- [x] 5.4 After merge to `main`, kick the operator deploy (`gh workflow run deploy.yml --repo <data-repo>`) per CONTRIBUTING — Worker `src/**` changed
