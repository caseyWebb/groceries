## Why

All cooking history today lives in recipe frontmatter: `last_cooked` (a last-write-wins max date) and `rating`. The `retrospective` tool (`docs/TOOLS.md:412`) promises `protein_mix` / `cuisine_mix` / `recipes_cooked` — but **none of those are computable from `last_cooked`**, which remembers only the most recent cook per recipe and discards everything before it. Only `underused` (recency) actually works against today's data model. This is the same data-readiness gap Change 08 hit: a tool specified against data that can't support it.

Worse, `last_cooked` is currently bumped at menu-**agreement** time (`AGENT_INSTRUCTIONS.md:93`), which is dishonest — agreeing to a menu is not cooking it. That violates the codebase's honesty rule (the order lifecycle's `ordered`/`received` are user-asserted, never agent-claimed).

This change introduces the durable event substrate that makes retrospection real, fixes the honesty problem structurally, and lays the foundation for a two-mode (plan / cook) agent.

## What Changes

- **New `cooking_log.toml`** — a durable, append-only **cooking** log (not an eating log: eating out is never logged; leftovers of an already-logged cook are not re-logged). Every row is one cooking or at-home convenience event, carrying a `type` (`recipe` | `ready_to_eat` | `ad_hoc`) so cook-vs-convenience trends are possible. Recipe-type entries are slug-only (protein/cuisine looked up from the recipe index at read time; recategorizing a recipe retroactively corrects history). `ready_to_eat` entries decrement the item's on-hand stock in `pantry.toml` and double as the favored-item frequency signal for re-order suggestions.
- **New `meal_plan.toml`** — a transient, recipe-grain record of committed **cook** intent for the next cooks. Cleared as each entry resolves. Extends the store model: `pantry` = observation, `stockup` = conditional intent, `grocery_list` = committed buy intent, **`meal_plan` = committed cook intent**, **`cooking_log` = realized history**.
- **BREAKING (behavior): plan agreement stops bumping `last_cooked`.** Menu agreement now writes `planned` rows to `meal_plan.toml`. `last_cooked` becomes a derivation: `max(cooking_log.date where recipe == slug)`, written in the same commit as the cooked entry. The index build soft-validates the two agree.
- **`retrospective` made real** — reads `cooking_log.toml` + the recipe index to return true `protein_mix`, `cuisine_mix`, `recipes_cooked`, `underused`, **cadence** (cooks/week, counting `recipe` + `ad_hoc` only), **cook-vs-convenience** (cooked = `recipe` + `ad_hoc` vs convenience = `ready_to_eat`), and **`ready_to_eat_favorites`** (frequency-ranked, feeding re-order suggestions).
- **Re-order suggestions in the menu flow** — favored ready-to-eat items (by log frequency) that are low/out in `pantry.toml` are surfaced at menu time ("you've had X several times — restock?") and, on agreement, written to `grocery_list.toml` / `stockup.toml`.
- **Controlled vocabulary for variety dimensions** — `protein` and `cuisine` frontmatter values are validated against allowed sets (coarse buckets, e.g. `fish` not `salmon`) so variety reasoning ("fish once a week", "no cuisine more than twice") is reliable. Validated when present; the existing warn-on-absent stays. The corpus is reconciled to the vocabulary during apply.
- **New `read_meal_plan` read tool**; `meal_plan` and `cooking_log` writes folded into `commit_changes` (like `recipe_updates` / `pantry_operations` today) — no per-file write tools.
- **Two modes named in `AGENT_INSTRUCTIONS.md`:**
  - **Plan mode** = everything today, plus writing `planned` and a session-start **stale-planned reconcile** ("you planned X, Y, Z — make any?", parallel to the existing stale-cart check).
  - **Cook mode (minimal here)** = "I'm making / I made X" → confirm, append a cooked entry, bump `last_cooked`, prompt pantry decrements (incl. "use the last of the ginger?"), remove the row from `meal_plan.toml`. No new tool — it reuses `commit_changes` + existing pantry tools + an instruction flow.
- **Populate `diet_principles.md`** (variety targets, restrictions, reasoning); menu generation honors principles **softly**, explaining tradeoffs when it can't satisfy all — now backed by real history from `retrospective`.
- **Docs sync:** `docs/SCHEMAS.md` entries for both new files; `CLAUDE.md` side-effect-file lines; `docs/TOOLS.md` updated (real `retrospective` return shape, `read_meal_plan`, new `commit_changes` sections).

## Capabilities

### New Capabilities
- `cooking-history`: the durable `cooking_log.toml` (cooked-only, append-only, typed entries), the `last_cooked` derivation rule, the `retrospective` aggregation tool, and the cook-capture transition that writes the log.
- `meal-planning`: the transient `meal_plan.toml`, the `read_meal_plan` tool, the `planned` lifecycle, the two-mode (plan/cook) framing, and the session-start stale-planned reconcile.

### Modified Capabilities
- `data-validation`: add structural rules for `cooking_log.toml` and `meal_plan.toml` (ISO dates, `type` enum, recipe-slug resolution); a soft `last_cooked`-consistency check (`last_cooked == max(log date for slug)`); and a controlled-vocabulary check for `protein` / `cuisine` frontmatter (validated when present).
- `menu-generation`: plan agreement writes `planned` rows to `meal_plan.toml` instead of bumping `last_cooked`; menu reasoning honors `diet_principles.md` softly using real `retrospective` history; the menu flow surfaces favored ready-to-eat re-order suggestions (favored-via-log + low/out-in-pantry).

## Impact

- **New side-effect files (agent-writable, NOT curated config):** `cooking_log.toml`, `meal_plan.toml` at the repo root.
- **Worker (`worker/`):** new `read_meal_plan` and `retrospective` tools; `commit_changes` gains `cooking_log_entries` and `meal_plan_ops` sections; the structural pre-commit validator gains the two new file shapes.
- **Index build (`scripts/build-indexes.mjs`):** validation for the two new files, the `last_cooked`-consistency soft-check, and the `protein`/`cuisine` controlled-vocabulary check.
- **Corpus reconciliation:** existing recipes whose `protein`/`cuisine` fall outside the seeded vocabularies are collapsed to the coarse buckets (e.g. `salmon` → `fish`) during apply, before the vocab check is enabled.
- **`pantry.toml`:** ready-to-eat items carry on-hand stock here (consumption decrements it); the `ready_to_eat/*.toml` catalogs stay pure options lists (no new stock field).
- **Docs:** `docs/SCHEMAS.md`, `docs/TOOLS.md`, `CLAUDE.md`, `AGENT_INSTRUCTIONS.md`, `diet_principles.md`.
- **Accepted tradeoff (from the split-file choice):** `meal_plan.toml` is transient, so there is **no durable record of past plans** — historical "did I cook what I planned last quarter" is intentionally not answerable (keeps the trend log pure). Current-week adherence ("planned 3, cooked 2 so far") is answerable from the live plan + this week's log.
- **Scope boundary:** the full hands-free, voice-guided cook walkthrough (step pacing, timers, proactive "add the garlic now") is deferred to a later **Guided cook mode** change. It will be a pure consumer/writer of these two files — zero schema migration — which is why the schema must be right now.
