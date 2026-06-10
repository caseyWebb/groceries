## 1. Schemas & seed files

- [x] 1.1 Create `cooking_log.toml` at the repo root with a header comment and a commented-out example entry per `type`
- [x] 1.2 Create `meal_plan.toml` at the repo root with a header comment and a commented-out example `[[planned]]` entry
- [x] 1.3 Add `docs/SCHEMAS.md` entries: both new files (fields, `type` enum `recipe|ready_to_eat|ad_hoc`, slug-only-for-recipe rule, `last_cooked` derivation note); the `protein`/`cuisine` allowed-value sets; a note that ready-to-eat on-hand stock lives in `pantry.toml` (RTE catalogs stay options-only)
- [x] 1.4 Add `cooking_log.toml` and `meal_plan.toml` to the agent-writable side-effect-files list in `CLAUDE.md` (explicitly NOT curated config)

## 2. Index-build validation (`scripts/build-indexes.mjs`)

- [x] 2.1 Hard-fail rules for `cooking_log.toml`: parse, required `date`/`type`, `type` enum (`recipe|ready_to_eat|ad_hoc`), `type=recipe` requires resolvable `recipe` slug, non-recipe requires `name`, valid ISO dates
- [x] 2.2 Hard-fail rules for `meal_plan.toml`: parse, `[[planned]]` requires resolvable `recipe` slug, valid `planned_for` ISO date when present
- [x] 2.3 Warn-only `last_cooked` consistency check: frontmatter `last_cooked` == max `cooking_log` date for that slug; recipes with no log entries never warn
- [x] 2.4 Seed the `protein`/`cuisine` allowed-value sets from the corpus (corpus already coarse — no `salmon`-style outliers to reconcile; build confirmed clean), then enable the hard-fail vocab check (present-but-out-of-vocab fails; absent stays warn-only)
- [x] 2.5 Tests for the new validation rules (valid, each hard-fail case, the `last_cooked` soft-check warn + no-entry no-warn, vocab in/out-of-set + absent-warns)

## 3. Worker — read & retrospective tools

- [x] 3.1 Implement `read_meal_plan` returning current `[[planned]]` entries (slug + optional `planned_for`), structured errors per the Change 04 convention
- [x] 3.2 Implement `retrospective(period)`: read `cooking_log.toml`, join `type=recipe` entries to the recipe index for protein/cuisine, return `recipes_cooked`, `protein_mix`, `cuisine_mix`, `underused`, cadence (cooks/week, `recipe`+`ad_hoc` only), cook-vs-convenience (cooked vs `ready_to_eat`), and `ready_to_eat_favorites` (frequency-ranked)
- [x] 3.3 Non-recipe entries contribute inline `protein`/`cuisine` to the mixes; missing dims bucket under `unknown`; unknown `type` buckets under its literal value
- [x] 3.4 Tests for `retrospective` aggregation (multi-cook protein counting, cadence excludes `ready_to_eat`, cook-vs-convenience split, `ready_to_eat_favorites` ranking, underused via derived `last_cooked`, period windowing) and `read_meal_plan`

## 4. Worker — write path (`commit_changes`)

- [x] 4.1 Add a `cooking_log_entries` section to `commit_changes` that appends entries and, for `type=recipe`, sets the recipe's `last_cooked` to the derived max log date in the same atomic commit. (RTE pantry decrement is the agent-supplied `pantry_operations` remove in the same call — pantry is presence-based, no auto-decrement; see note below.)
- [x] 4.2 Add a `meal_plan_ops` section to `commit_changes` (add/remove `[[planned]]` rows, incl. `planned_for`)
- [x] 4.3 Extend the Worker's structural pre-commit validator (TS subset) to cover both new files' shapes and the `type` enum
- [x] 4.4 Tests: cooking-log append + derived `last_cooked` (incl. max-over-existing); meal-plan add/remove; validation_failed on bad entry; (cook-capture pantry decrement + clear-planned-row compose via existing `pantry_operations`/`meal_plan_ops` sections, each tested)

## 5. Docs sync

- [x] 5.1 Update `docs/TOOLS.md`: real `retrospective` return shape (incl. `ready_to_eat_favorites`, cadence/convenience semantics), new `read_meal_plan`, `commit_changes` `cooking_log_entries` (with RTE pantry decrement) + `meal_plan_ops` sections

## 6. Agent behavior (`AGENT_INSTRUCTIONS.md`)

- [x] 6.1 Name and describe the two modes (plan / cook) and how an utterance routes between them
- [x] 6.2 Rewire menu-agreement persistence: write `[[planned]]` to `meal_plan.toml`; STOP bumping `last_cooked` at agreement (update the line at the current `last_cooked`-on-agreement guidance)
- [x] 6.3 Add the minimal cook-capture flow ("I'm making/I made X" → confirm, log cook, bump `last_cooked`, prompt pantry decrements incl. "used the last of?", clear planned row); ready-to-eat consumption logs a `ready_to_eat` entry + pantry decrement
- [x] 6.4 Add the session-start stale-planned reconcile, surfacing only DUE rows (`planned_for ≤ today` or unset), parallel to the stale-cart check; never silently promote a plan to a cook
- [x] 6.5 Add the retrospective conversational pattern; fold soft variety honoring (grounded in `retrospective`) into menu generation; add the favored-ready-to-eat restock suggestion (favored-via-log + low/out-in-pantry → prompt, write `grocery_list`/`stockup` only on agreement)

## 7. Diet principles

- [x] 7.1 Populate `diet_principles.md` — agent-drafted starter (variety targets phrased in the controlled `protein`/`cuisine` vocab; restrictions left blank for the user; clearly marked for the user to edit), per the user's "draft a starter to approve" decision

## 8. Verify & finalize

- [x] 8.1 `npm test` (root) and `cd worker && npm test && npm run typecheck` pass
- [x] 8.2 `npm run build:indexes` runs clean against the corpus (no unexpected hard-fails; empty log produces no `last_cooked` warnings)
- [x] 8.3 `openspec validate "cooking-log-and-retrospection"` passes; confirm `docs/TOOLS.md` matches the implemented tool surface (no drift)
