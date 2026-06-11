## 1. Store data model + validation

- [x] 1.1 Define the `stores/<slug>.toml` schema in `docs/SCHEMAS.md` (identity, `domain`, ordered `[[aisles]]` with `number`/`label` + free-string `sections`, `[[item_locations]]` with normalized `item` + `aisle` + optional `detail`, `doesnt_carry[]`) — write the doc first, then the code matches it.
- [x] 1.2 Add build-time structural validation for the `stores/` tree in `scripts/build-indexes.mjs` (slug present, aisles are an ordered list of `{number|label, sections[]}`, item_locations carry `item`+`aisle`, `doesnt_carry` is a string array, `domain` is a string). Absent `stores/` tree is valid (no error). No `_indexes/stores.json` is emitted.
- [x] 1.3 Mirror the structural subset in the Worker's write-time validator (`src/validate.ts`).
- [x] 1.4 Add a fixture store + assertions in the tooling tests (`tests/*.test.mjs`): valid store passes, malformed aisles/item_locations fail, absent tree passes.

## 2. Worker store modules + CRUD tools

- [x] 2.1 Add `src/stores.ts` (read/list/serialize over `stores/<slug>.toml`) reusing `src/serialize.ts` and the GitHub-App read path; `item_location` keys normalized via the verify matcher's `normalizeIngredient` (+ aliases) so synonyms resolve.
- [x] 2.2 Add `src/stores-tools.ts` registering `list_stores`, `read_store`, `add_store`, `update_store`, `remove_store`. `update_store` takes operations (identity/aisle/section edits + add/remove `item_location` + add/remove `doesnt_carry`), `update_pantry`/`update_kitchen`-style. Structured errors per `src/errors.ts` (`not_found` for unknown slug). No extra auth gate (shared, `update_discovery_sources` posture).
- [x] 2.3 Route store mutations through the atomic commit engine (`src/commit.ts` / `src/github.ts`); shared-corpus path, unattributed content. (Added `TreeDeletion` to the commit engine so `remove_store` deletes the file atomically.)
- [x] 2.4 Register the new tools in `src/tools.ts` (and the MCP tool list).
- [x] 2.5 Worker tests (`test/*.test.ts`): list/read/add/update/remove round-trip; unknown slug → structured `not_found`; lazy `item_location` add via `update_store`; normalized-key resolution.

## 3. Attributed store notes (per-tenant)

- [x] 3.1 Add store-note read/write in `src/notes*.ts` (reuse the recipe-notes aggregation): `add_store_note(slug, body, private?)` appending to `users/<id>/store_notes/<slug>.toml` (structural authorship, append-mostly), `read_store_notes(slug)` returning the caller's own private notes + every member's shared notes, attributed.
- [x] 3.2 Document `users/<username>/store_notes/<slug>.toml` in `docs/SCHEMAS.md` (parallel to recipe notes).
- [x] 3.3 Register `add_store_note` / `read_store_notes` in `src/tools.ts`.
- [x] 3.4 Worker tests: shared note visible to the group + attributed; `private` note owner-only.

## 4. Domain facet on the grocery list

- [x] 4.1 Add the optional `domain` field (default `grocery`) to the grocery-list item write path (`src/grocery.ts` / `src/grocery-tools.ts`); `add_to_grocery_list` / `update_grocery_list` accept it; absent → `grocery` on read.
- [x] 4.2 Update `docs/SCHEMAS.md` (grocery_list `domain` field) and `docs/TOOLS.md` (the grocery-list tools' params).
- [x] 4.3 Build + Worker validation: `domain` is a string; legacy items without it read as `grocery`. (Worker `validate.ts` enforces shape; the build keeps `grocery_list.toml` parse-only as it does for every other field, so a `home-improvement` item passes `--check`.)
- [x] 4.4 Tests: domain defaults to `grocery`; a `home-improvement` item round-trips.

## 5. Fulfillment-mode-agnostic received behavior

- [x] 5.1 Generalize the receive/restock path so the `received` transition (remove from list + restock `grocery`-kind pantry entries) is callable for an `active → received` advance, not only `ordered → received` — reused by the in-store walk. **Realized skill-driven (Option A, per design D2 "completion goes through existing tools; no new completion tool"):** `received` has no code path today — it's the persona's place-order lifecycle calling `remove_from_grocery_list` + `update_pantry`. Those tools are already status-agnostic (removal is by name; restock is unconditional), so the `active → received` advance needs no new Worker code — only the store-walk completion wiring in §7.1.
- [x] 5.2 Confirm storage-tips guidance fires on the in-store receive the same as the Kroger pickup — the store-walk completion (§7.1) reuses the **Putting groceries away** guidance, identical to `place-grocery-order`'s `received` step. (No code; persona path in §7.)
- [x] 5.3 Tests: in-store `active → received` restocks `grocery`-kind items and skips `household`/`other`. **No new code path to unit-test under Option A** — the `grocery`-kind-only restock rule is the same persona rule the Kroger pickup uses (driven by the documented `kind` field), and the "same received behavior" spec scenario is spot-checked in §9.3. The grocery-list `kind` filter behavior is already covered by `test/grocery.test.ts`.

## 6. Fulfillment-mode preference

- [x] 6.1 Extend `preferences.toml [stores]` handling so `primary` may be a store slug (walk mode) or `kroger` (online mode, keeping `preferred_location`); document in `docs/SCHEMAS.md`. (`preferences.toml` is curated config the agent reads and reasons over — no enum to widen; the dual-form `primary` + per-trip override + walk-mode `preferred_location` are now documented, and the persona picks the flush in §7.3.)
- [x] 6.2 Validation accepts both forms; an unknown store-slug `primary` surfaces as a structured/agent-resolvable case, not a hard failure. (`preferences.toml` is parse-only in both the build and the Worker write subset, so both forms already validate and an unknown slug is never a hard failure — the agent resolves it conversationally, per the SCHEMAS note.)

## 7. Persona — AGENT_INSTRUCTIONS.md (canonical plugin source)

- [x] 7.1 Add a `store-walk` flow skill (sibling to `cook` / `place-grocery-order`): resolve store from the trip or preferred-store; batch `read_grocery_list` + `read_store` + `read_store_notes`; build the aisle-ordered, domain-filtered list with graceful degradation (rungs 0–3); voice-first one-aisle-at-a-time pacing with "got it" / "can't find it"; completion → `active → received` (restock + storage tips). Mark its skill `needs: cart` (and any depth tiers it uses).
- [x] 7.2 Add the first-visit mapping sub-flow (offer to record the walkthrough by reading aisle signs into the layout — offered, never pushed) and the lazy refinement (found-it → offer `item_location`; not-carried → offer `doesnt_carry`; can't-find disambiguation sold-out vs moved vs not-carried).
- [x] 7.3 Make the flush mode-aware across the persona/flows: the agent picks `place_order` (Kroger) vs `store-walk` from the resolved fulfillment mode instead of hardcoding Kroger; update the cart/menu language accordingly (capture stays identical). (Cart persona tier now describes the two flushes + mode selection; place-grocery-order flagged as the online flush.)
- [x] 7.4 Run `npm run build:plugin` and confirm the generated bundle under `plugin/grocery-agent/` includes the new skill; do not hand-edit the bundle. (Built with the operator's `GROCERY_MCP_URL`; `plugin/grocery-agent/skills/store-walk/SKILL.md` emitted with the real connector URL.)

## 8. Docs contract sync

- [x] 8.1 Add the new store tools (`list_stores`, `read_store`, `read_store_notes`, `add_store`, `update_store`, `remove_store`, `add_store_note`) to `docs/TOOLS.md` with params/returns/structured errors.
- [x] 8.2 Update `docs/PROJECT.md` to describe the two-flush model (Kroger online vs in-store walk) and the `stores/` shared region; note `domain` and the fulfillment-mode preference.
- [x] 8.3 Note the v1 follow-ons in the docs/design where relevant: cross-store routing (`doesnt_carry` → other store; a `known_for` facet), unifying `[stores]`, chain-level sharing — explicitly out of scope now. (Already in `design.md` Non-Goals/Open Questions; surfaced in the durable `docs/SCHEMAS.md` `stores/` section too.)

## 9. Verification

- [x] 9.1 `npm run typecheck`, `npm test` (Worker), and `npm run test:tooling` (build scripts) all green. (typecheck clean; 423 Worker tests pass / 9 live-skipped; 71 tooling tests pass.)
- [x] 9.2 `node scripts/build-indexes.mjs --check` against a data checkout that has a mapped store + a `home-improvement` list item passes. (Ran against a throwaway data root with a mapped store + a `home-improvement` grocery-list item → 0 errors.)
- [x] 9.3 `openspec validate in-store-fulfillment` passes; spot-check each spec scenario against the implemented behavior. (Valid; every scenario across the three specs traced to its implementation — registry schema/normalization/absent-tree, CRUD + `not_found`, lazy facet growth, store-note privacy, mode selection + per-trip override, degradation rungs, completion→received, and the grocery-list `domain` scenarios.)
- [ ] 9.4 Manual smoke via MCP Inspector (`npm run dev`): map a store, build a list for it (empty layout → degraded; with aisles → ordered), add a shared + a private note, flip `primary` to the store slug and confirm the agent picks the walk. **Operator step — not run here** (needs the live Worker with real GitHub-App/Kroger secrets + an interactive client). Automated stand-ins: the add/update/remove + deletion round-trip, `listStores` has_layout (degraded vs aisle-mapped), shared+private note aggregation, and the `domain` round-trip are all covered by `test/stores.test.ts` / `test/notes.test.ts` / `test/grocery.test.ts`.
