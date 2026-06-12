## Context

The `in-store-fulfillment` capability shipped a single `store-walk` skill plus a structured shared `stores/<slug>.toml` model (`aisles[]`, `item_locations[]`, `doesnt_carry[]`) and a parallel attributed store-notes system (`users/<id>/store_notes/<slug>.toml`). In use, two seams showed:

1. **`store-walk` conflates three activities** — *display* the list, *walk* it hands-free, and *map* an unfamiliar store. Each wants a different front door and a different interaction mode, but they're fused into one linear flow.
2. **Two systems describe one subject.** The structured aisle model is the lone place the project broke its otherwise-universal "agent judgment over open vocabulary, no manifest" posture (cf. `storage-guidance`, recipe classification, item→aisle placement). Store notes already hold free-form store knowledge; the structured layout duplicates the subject with a heavier, parallel shape.

This change re-cuts the skills and collapses the layout into notes, while keeping the slim identity registry and adding the note mutation needed to make notes-only viable. `in-store-fulfillment` is **not yet canonical** in `openspec/specs/` — it lives only in its own unarchived change (32/33), which this delta builds on.

## Goals / Non-Goals

**Goals:**
- A display-first `shopping-list` skill that groups by a department→aisle ladder, filters by store domain, nudges toward a known mapped store, and gates a voice walk on layout being known.
- A `map-grocery-store` skill that maps a store *alongside* a real trip, persisting layout incrementally and converging on the existing `received` completion.
- One store-knowledge surface: layout / locations / not-carried become tagged notes read via `read_store_notes`; the structured facets are removed.
- Clean self-correction of notes (edit + delete, recipe and store) so notes-only doesn't regress correctability for the common case.

**Non-Goals:**
- Group-editability of objective layout (an unattributed shared file). That was the structured model's one advantage; we accept supersede-by-recency for *other* tenants' stale notes.
- Cross-store routing, chain-level layout sharing, folding Kroger's location into `stores/` — still deferred (unchanged from `in-store-fulfillment`).
- The non-grocery skill surface. The `domain` filter is exercised (Lowe's shows only `home-improvement` items) but no hardware-specific mapping/agent copy is built.
- Any change to `grocery-list`'s `domain` facet or `order-placement`'s `received` behavior — both reused as-is.

## Decisions

### D1 — Split `store-walk` into `shopping-list` + `map-grocery-store`
The skill did display + walk + map. We separate the *front door* (display, read-only) from the *mapping flow*. **The known-layout voice walk folds into `shopping-list`** (not a third skill), gated behind the explicit "enter voice mode?" offer — matching the user's two-skill framing and keeping a single front door for "what's on my list?" through "walk me through it." *Alternative considered:* a thin third `store-walk` for the known-layout walk — rejected as an extra handoff hop for the common case.

### D2 — `map-grocery-store` owns the `received` completion
Mapping runs alongside a real trip (you buy while you map), so it ends like any walk: picked `grocery`-kind items advance `active → received`, the pantry restocks, storage tips are offered. Both skills converge on the **existing** mode-agnostic `received` behavior (`order-placement`); neither duplicates it. *Alternative:* mapping hands the completion back to the walk — rejected as splitting one trip across two skills.

### D3 — Notes-only layout, over the structured model
Remove `aisles[]` / `item_locations[]` / `doesnt_carry[]` and their five `update_store` ops. Layout, where-it-hides locations, and not-carried entries become **tagged store notes** (`layout` / `location` / `stock`), read in the one `read_store_notes` call that already returns hours/parking/personal observations. This fully commits to the open-vocab "agent judgment" posture and makes "save as you go" the *natural* behavior — `add_store_note` is append-only and auto-commits, so each aisle is durable the instant it's spoken, with no clobber risk. *Alternative considered:* keep structure and add an `add_aisle` append op — rejected; it keeps two systems for one subject when the philosophy points at one.

**Accepted costs:** (a) ordering is inferred at read rather than stored — mitigated by leading layout notes with the aisle number and using store-flow world knowledge for unnumbered zones; (b) no clean delete across tenants — mitigated by recency (`created_at`) at read plus the note-edit/delete of D5 for your own notes.

### D4 — Keep a slim identity registry (not a full teardown)
`stores/<slug>.toml` survives as identity only (name, label, chain, address, `domain`); `add_store` / `read_store` / `list_stores` / `remove_store` stay; `update_store` keeps identity edits and drops the five layout ops. This buys clean name→slug resolution, a real `list_stores` for the proactive nudge, and a stored `domain` for known stores — without re-classifying every read. `list_stores`' `has_layout` becomes `has_notes`. *Alternative:* drop `stores/` entirely and classify `domain` by world knowledge — rejected as fuzzier resolution for marginal surface savings.

### D5 — Note edit/delete, keyed by `created_at`, self-scoped
Add `remove_store_note` / `update_store_note` and `remove_recipe_note` / `update_recipe_note`, backed by a shared pure core (`removeNote` / `updateNote` in `notes.ts`). Notes are addressed by their `created_at` — `new Date().toISOString()` is millisecond-precision, so two `add_store_note` calls (separate Worker invocations) never collide even during rapid mapping; no `id` field is added. Writes land under the caller's `users/<id>/` subtree, so the tools are **self-scoped by construction** — you can only edit/delete your own notes. This recovers clean correction for the dominant case (re-mapping your own store); a different tenant's stale note still supersedes by recency. Recipe-note mutation rides along for symmetry on the shared core. *Alternative:* a stable `id` field on every note — rejected as unnecessary given ms-precision timestamps. *Alternative:* store notes only — rejected; the core serves both and symmetry is nearly free.

## Risks / Trade-offs

- **A different tenant's stale layout note can't be deleted by you** → self-scoped authorship means cross-tenant correction stays supersede-by-recency. Acceptable at this group's scale (one mapper per store, rare remodels); the escape hatch if it ever bites is a future unattributed shared layout, not in scope.
- **Inferred ordering varies run-to-run** → number the aisle notes; the agent already does open-vocab placement, so this is the same class of judgment, not a new one.
- **Removing the structured facets could break reads of already-written store files** → the parser MUST silently ignore legacy `aisles`/`item_locations`/`doesnt_carry` keys (treat as absent), never error. Verified-safe regardless of whether live data exists.
- **Editable notes weaken the "append-only, unspoofable history" property** → mutation is restricted to the author's own subtree; shared content and other tenants' notes remain untouchable. The audit value of append-only yields to the practical need to correct a stale map.
- **`created_at` collision** → ms precision across separate invocations makes this effectively impossible; if a future batch path ever wrote two notes in one invocation, it would need distinct timestamps (not a concern for any current path).

## Migration Plan

1. **Confirm no live aisle data** — glance at the operator data repo for `stores/*.toml` carrying real `aisles`/`item_locations`/`doesnt_carry`. If any exist, the layout is abandoned (not auto-converted); graceful-ignore parsing keeps reads working.
2. **Worker + docs in one pass** — ship the `stores.ts`/`stores-tools.ts`/`notes*.ts` changes with `docs/TOOLS.md` + `docs/SCHEMAS.md` updated together (the no-drift rule).
3. **Rebuild the plugin** from the re-cut `AGENT_INSTRUCTIONS.md` (`npm run build:plugin`).
4. **Archive ordering (load-bearing):** the `in-store-fulfillment` change must archive **before or together with** this one, so this delta's `MODIFIED`/`REMOVED` requirements have a canonical base. If this archives first, the delta has nothing to apply against.
5. **Rollback:** no data is destroyed (removed facets are simply ignored, never deleted from existing files); reverting the Worker + plugin restores prior behavior, and any notes written by the new skills remain valid store notes.

## Open Questions

- None blocking. The `has_layout` → `has_notes` signal on `list_stores` is settled as "does this store have layout-tagged notes" — an implementation detail of how `list_stores` peeks at notes (direct read vs. a cheap cached flag) to be decided in apply.
