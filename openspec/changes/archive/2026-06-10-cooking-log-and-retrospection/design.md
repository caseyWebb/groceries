## Context

Cooking history is currently a projection, not a record. Recipe frontmatter carries `last_cooked` (a single ISO date, overwritten on every cook) and `rating` (a single int). `last_cooked` is a materialized `max()` — it remembers only the most recent cook per recipe and throws away the rest. The `retrospective` tool (`docs/TOOLS.md:412`) was specified to return `protein_mix` / `cuisine_mix` / `recipes_cooked`, but those require an **event stream** (count of cooks bucketed by dimension over a window), which `last_cooked` cannot provide. Only `underused` (recency) is answerable today. This is the same data-readiness gap Change 08 surfaced for pantry verification.

Two further realities shape the design:

- **The honesty rule.** This codebase never claims an unverifiable event happened. The order lifecycle's `ordered` and `received` are user-asserted, and the agent is forbidden from claiming a cart was cleared. But `last_cooked` is bumped at menu-**agreement** time (`AGENT_INSTRUCTIONS.md:93`) — planning is treated as cooking. That is exactly the sin the order lifecycle avoids.
- **The store model.** The repo already separates `pantry` (observation), `stockup` (conditional intent), and `grocery_list` (committed buy intent). A "what to cook" record is a natural fifth store, and "what actually got cooked" is the realized-history sink.

The user also wants the agent to eventually operate in two explicit modes — **plan** (today's inventory/recipe/order behavior) and **cook** (hands-free, voice, "I'm making X", walk me through it, update inventory). The full guided cook walkthrough is out of scope here, but the data model must be designed so it lands later with zero migration.

## Goals / Non-Goals

**Goals:**
- A durable, append-only, human-inspectable event log of meals actually cooked, sufficient to compute real protein/cuisine mix, cadence, and cook-vs-convenience trends.
- Make `last_cooked` honest: it moves only on an asserted cook, never on a plan.
- A transient record of committed cook intent that survives across sessions (resume: "you planned X, Y, Z — make any?").
- Make `retrospective` deliver on its specified return shape.
- Populate `diet_principles.md` and have menu generation honor it softly, backed by real history.
- Name the two modes and ship the minimal cook-capture flow; leave the schema ready for guided cook mode.

**Non-Goals:**
- The hands-free, voice-guided cook walkthrough (step pacing, timers, proactive ingredient prompts). Deferred to a later **Guided cook mode** change.
- A durable archive of past *plans* (see the transient-`meal_plan` trade-off below).
- Portion/quantity-level tracking of cooked or leftover food (still a whiteboard problem per `AGENT_INSTRUCTIONS.md:181`).
- Any new Kroger or cart behavior.

## Decisions

### Decision 1: Two files, not one log with a status field

`cooking_log.toml` is **cooked-only** and append-only; planned state lives in a separate transient `meal_plan.toml`.

- **Why:** keeps the durable trend spine pristine — every row in `cooking_log.toml` is a real meal, so analytics never has to filter out unrealized intent, and the file reads cleanly as "what I've eaten." The planned→cooked transition is a remove-from-plan + append-to-log, both inside one atomic `commit_changes`.
- **Alternative considered (one file, `status: planned|cooked`):** a single in-place edit for the transition and trivial current-plan adherence, mirroring the order lifecycle 1:1. Rejected because it pollutes the durable trend log with transient/abandoned rows and makes the log's primary read ("what did I cook") a filtered query forever.
- **Trade-off accepted:** the transition crosses two files, and historical plan-adherence is lost (see Risks).

### Decision 2: It's a cooking log, not an eating log — typed, recipe entries slug-only

```toml
[[entries]]
date   = 2026-06-09        # ISO date, required
type   = "recipe"          # recipe | ready_to_eat | ad_hoc, required
recipe = "arroz-caldo"     # slug; present iff type == recipe

[[entries]]
date    = 2026-06-08
type    = "ready_to_eat"
name    = "Kroger frozen lasagna"   # present for non-recipe types
cuisine = "italian"        # optional inline dims so it still counts in mixes
protein = "beef"
```

- **Cooking, not eating.** The log records *cooking events* (and at-home convenience meals), not everything eaten. **Eating out is never logged.** **Leftovers** of an already-logged cook are **not** re-logged — cooking bolognese once that feeds three dinners is one entry. This keeps the log honest about what the capture flow actually observes and stays clear of the portion/leftover tracking the project already refuses (`AGENT_INSTRUCTIONS.md:181`). The `ate_out` type from earlier drafts is therefore **dropped**.
- **Why slug-only for recipes:** protein/cuisine live in recipe frontmatter and are the single source of truth. Looking them up from the recipe index at read time means recategorizing a recipe retroactively corrects its history mix — desirable. Entries stay tiny.
- **Why `type` from the start:** the cook-vs-convenience ratio (cooked = `recipe` + `ad_hoc` vs convenience = `ready_to_eat`) is impossible to reconstruct later without the field. Non-recipe entries carry an inline `name` and optional `protein`/`cuisine` so they still contribute to mix aggregates.

### Decision 2a: `ready_to_eat` consumption — stock in pantry, log as favored signal

Logging "I had the frozen lasagna" does **two** things: it **decrements that item's on-hand stock in `pantry.toml`** (a ready-to-eat item physically in the freezer is an observation, so it lives in the pantry store; the `ready_to_eat/*.toml` catalog stays a pure options list with no stock field), and it **appends a `type = ready_to_eat` entry** whose accumulating frequency is the favored-item signal for re-order suggestions.

- **Why pantry, not a new catalog field:** the three-store model already owns "what's physically here." Adding an `on_hand` counter to the RTE catalog would duplicate that and conflate the options list with inventory.
- **Why the log carries the favored signal:** frequency falls straight out of counting `ready_to_eat` entries over a window — no extra `times_had` field to maintain, and it stays correct under hand-edits.

### Decision 2b: Re-order suggestions in the menu flow

`retrospective` exposes a `ready_to_eat_favorites` aggregate (frequency-ranked). The menu flow cross-references favored items against `pantry.toml` on-hand and surfaces a restock nudge ("you've had X several times and you're out — add it?"); on agreement it writes to `grocery_list.toml` (or `stockup.toml` for a conditional bulk buy). This is a behavior modification to `menu-generation`, scoped into this change.

### Decision 3: `last_cooked` is derived, written in the same commit

`last_cooked = max(cooking_log.date where type == recipe and recipe == slug)`.

- It remains denormalized into recipe frontmatter as a fast-path projection (`list_recipes(not_cooked_since=...)`, verify/variety nudges read it from the index without scanning the log).
- It is written **in the same `commit_changes`** that appends the cooked entry — never on its own, and never at plan time.
- The index build adds a **soft** check (warn, not fail) that frontmatter `last_cooked` equals the max log date for that slug, catching drift without blocking commits.

### Decision 4: `meal_plan.toml` is a separate recipe-grain file, not derived from `grocery_list`

```toml
[[planned]]
recipe      = "arroz-caldo"
planned_for = 2026-06-10   # optional ISO date
```

- **Why not derive planned recipes from `grocery_list.for_recipes`:** the grocery list is ingredient-grain and holds only things that must be *bought*. A planned recipe whose ingredients are all already in the pantry contributes nothing to the grocery list and would be invisible. Cook intent and buy intent are genuinely different grains.
- Cleared as each entry resolves (cooked → removed; abandoned → dropped at the reconcile beat).

### Decision 5: Minimal new tool surface

- **New read:** `read_meal_plan` (for the session-start reconcile).
- **New analysis tool:** `retrospective`, now reading `cooking_log.toml` + the recipe index.
- **No per-file write tools.** `meal_plan` and `cooking_log` writes fold into `commit_changes` as new sections (`meal_plan_ops`, `cooking_log_entries`), consistent with how `recipe_updates` / `pantry_operations` already work. The minimal cook-capture flow therefore needs no new write tool — it's `commit_changes` + existing pantry tools + an `AGENT_INSTRUCTIONS.md` flow.

### Decision 6: Two modes; minimal cook capture now

- **Plan mode** = all existing flows, plus: on menu agreement write `planned` rows (Decision 4, replacing the `last_cooked` bump), and a **stale-planned reconcile** at session start, structurally parallel to the order flow's stale-cart check. The reconcile surfaces only rows that are **due** — `planned_for ≤ today`, or `planned_for` unset — and leaves future-dated plans alone (so planning Mon–Wed and opening the app Tuesday doesn't nag about Wednesday). A `planned_for`-less row is treated as due at the next session so it can't linger forever; the menu flow SHOULD set `planned_for` when it has the cooking nights.
- **Cook mode (minimal)** = "I'm making / I made X" → confirm the cook, append a `cooking_log` entry, bump `last_cooked`, prompt pantry decrements (including "did you use the last of the ginger?"), and remove the resolved row from `meal_plan.toml` — all in one `commit_changes`.

### Decision 7: Variety honoring folds into menu-generation

`diet_principles.md` is populated (variety targets, restrictions, reasoning). Menu generation honors it **softly** — explaining tradeoffs when it can't satisfy every principle — using real history from `retrospective`. This is a behavior modification to the existing `menu-generation` capability, not a new capability.

### Decision 8: Controlled vocabulary for `protein` and `cuisine`

Variety reasoning is only reliable if the dimensions it counts are consistent — "fish once a week" breaks if recipes are tagged `salmon`, `fish`, and `seafood` interchangeably, exactly the drift Change 13 addresses for components. So `protein` and `cuisine` frontmatter values are validated against allowed sets of **coarse buckets** (prefer `fish` over `salmon`).

- **Validated when present, not required:** a recipe with an out-of-vocabulary `protein`/`cuisine` is a hard build failure; a recipe *missing* the field keeps the existing warn-only treatment. This delivers reliable variety without forcing a full corpus backfill in this change.
- **Where the vocabulary lives:** allowed-value lists defined in the validator (like the existing `status` enum) and documented in `docs/SCHEMAS.md`. If they later need to be user-editable, they can be promoted to a registry file the way Change 13 does for components. Not over-built now.
- **Seeded by corpus reconciliation:** the exact members are harvested from the existing corpus during apply and collapsed to coarse buckets; the reconciliation pass runs *before* the vocab check is switched to hard-fail so the build doesn't break mid-migration.
- **Scope:** both `protein` and `cuisine` get this treatment, since the variety rules reference both.

## Risks / Trade-offs

- **No durable record of past plans** → By design (Decision 1). Historical "did I cook what I planned last quarter" is unanswerable; current-week adherence ("planned 3, cooked 2 so far") is answerable from the live `meal_plan.toml` + this week's log. Accepted to keep the trend log pure.
- **Capture rate depends on the user asserting cooks** → Mitigation: cooking is already the utterance that should decrement the pantry, so the log piggybacks on a beat the user has reason to perform; the stale-planned reconcile prompts for unconfirmed plans at session start. Same bet Change 08 makes about pantry staples staying honest through conversational upkeep.
- **Two-writer drift between `last_cooked` and the log** → Mitigation: always co-written in one commit (Decision 3) + index-build soft-check flags any divergence.
- **The planned→cooked transition spans two files** → Mitigation: both mutations ride a single atomic `commit_changes`; a partial write is impossible because the commit is one git tree update.
- **`type` taxonomy may prove too coarse/fine** → Starting with `recipe | ready_to_eat | ad_hoc`; the field is open to extension, and analytics buckets gracefully on unknown types (counted under their literal `type`).
- **History blocks recipe deletion** → A `type = recipe` log entry referencing an unresolvable slug is a hard build failure (see `data-validation`). This is intentional: the lifecycle uses `status: archived` (the file persists, so history resolves and "nope, didn't like this" is explicitly recorded), and deletion-with-history is blocked. The escape hatch is a manual edit of `cooking_log.toml` — there is deliberately **no agent remove tool**. Removing an entry by hand may leave `last_cooked` stale; the consistency soft-check flags it for a manual frontmatter fix.
- **Vocabulary reconciliation could break the build mid-migration** → The corpus reconciliation (collapse `salmon`→`fish`, etc.) runs before the `protein`/`cuisine` vocab check is switched to hard-fail; until then the check warns. Verify the build is clean before flipping it.

## Migration Plan

- Both files are new and start empty (or with a header comment + commented example), so there is no data migration for them.
- The behavior change (stop bumping `last_cooked` at agreement) is a `AGENT_INSTRUCTIONS.md` + `menu-generation` spec edit; existing `last_cooked` values remain valid as the historical max.
- The index-build `last_cooked`-consistency check ships as **warn-only** so the (empty) log does not flag every already-cooked recipe on day one.
- **Vocabulary reconciliation:** seed the `protein`/`cuisine` allowed sets from existing corpus values, collapse outliers to coarse buckets (`salmon`→`fish`, …), confirm `npm run build:indexes` is clean, *then* enable the hard-fail vocab check.
- **ready-to-eat stock:** existing RTE catalog files are unchanged; on-hand stock for RTE items begins accumulating in `pantry.toml` as they're bought/consumed — no backfill needed.
