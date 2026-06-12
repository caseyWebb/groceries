## 1. Remove the substitution engine, tool, and tests

- [x] 1.1 Delete `src/substitutions.ts` (parse / `mergeSubstitutionRules` / `findRule` / `acceptableInPantry` / `proposeInventory` / `proposeSale`) and `test/substitutions.test.ts`.
- [x] 1.2 Remove `propose_substitutions` and `getSubstitutionRules` from `src/tools.ts`, plus the `./substitutions.js` imports there.
- [x] 1.3 Remove the `against_substitutions` branch and field from `kroger_flyer` in `src/tools.ts` (keep `terms`, `against_stockup`, `min_savings_pct`).
- [x] 1.4 **Retire `verify_pantry` entirely.** Delete `src/pantry-verify.ts`, the `verify_pantry_for_recipe` / `verify_pantry_for_candidates` tool registrations and the `getRecipeIngredients` helper in `src/tools.ts`, and the now-orphaned `src/recipe-ingredients.ts` (verified sole consumer was `verify`). Delete `test/pantry-verify.test.ts` and `test/recipe-ingredients.test.ts`. **Keep** `mark_pantry_verified`; **confirm** `place_order`/`order.ts` still build the buy set from `grocery_list ∪ caller-supplied menu_needs` (no recipe parsing) and that `perishable_ingredients` normalization (`write-tools.ts`) is independent — both verified during scoping, re-confirm after deletion via `npm test`.

## 2. Remove the write surface

- [x] 2.1 Remove `update_substitutions` and the `"substitutions"` entry from `CURATED_FILES` / `SHARED_CURATED` in `src/write-tools.ts`.
- [x] 2.2 Remove `"substitutions"` from the `commit_changes` `config_updates` file enum in `src/write-tools.ts`.
- [x] 2.3 Drop "substitutions" from the curated-parse comment in `src/validate.ts:266` (no behavior change — it was generic parse-only).

## 3. Delete the data files

- [x] 3.1 Delete `docs/data-template/substitutions.toml`.
- [x] 3.2 (Operator, out-of-repo) delete shared `substitutions.toml` and any `users/<id>/substitutions.toml` from the data repo. No migration. — Done: deleted root `substitutions.toml` from `caseyWebb/groceries-agent-data` (commit `8951b71`); no per-tenant overrides existed.

## 4. Rewrite the meal-plan flow (pantry-as-selection-input + LLM subs)

- [x] 4.1 In `AGENT_INSTRUCTIONS.md` `meal-plan`: add `read_pantry()` to the up-front selection load and **remove the step-1 `verify_pantry_for_recipe` / `verify_pantry_for_candidates` calls**. Selection reasons over `list_recipes` metadata + the loaded pantry; `kroger_prices` stays a post-selection costing call.
- [x] 4.2 Rewrite step 2: the bucket work (freshness from age fields, fuzzy/semantic pantry matches, inventory substitutions — "recipe wants salmon, you've got trout") becomes LLM reasoning over the loaded pantry, still calling `mark_pantry_verified` for items the user confirms. Add a **cost/confirm** step: `read_recipe` the chosen recipes, match their ingredients against the loaded pantry, confirm conversationally, and emit the to-buy items as `grocery_list_ops` (presence-only; no quantity netting).
- [x] 4.3 Update the line-30 standing-habit blurb ("inventory subs come up during the pantry pass") to describe subs as LLM judgment over the loaded pantry; drop the `propose_substitutions` reference. Keep the step-87 sale-sub bullet but source candidates from world knowledge passed to `kroger_flyer`/`kroger_prices` as explicit `terms`.
- [x] 4.4 Remove the line-49 mention of "substitution rules" from the my-config-is-mine paragraph; add a redirect so a voiced standing sub-preference or veto is offered for capture into `taste.md` (honored prose), not a rule file.
- [x] 4.5 Update the unavailable-fallback line (place-order flow, ~line 223) so an `unavailable` item offers LLM-enumerated Kroger alternatives instead of `propose_substitutions`.
- [x] 4.6 `npm run build:plugin` to regenerate `plugin/` from the edited source.

## 5. Docs

- [x] 5.1 `docs/SCHEMAS.md`: delete the `## substitutions.toml` section and the per-tenant-override note in the placement section.
- [x] 5.2 `docs/TOOLS.md`: remove `propose_substitutions`, `update_substitutions`, the `against_substitutions` flyer flag, and the `inventory_substitutes_available` bucket from the verify entries.
- [x] 5.3 `docs/ARCHITECTURE.md`: update the 5 substitution refs (determinism-boundary diagram line ~31; Worker tool-surface line ~44; shared-corpus list line ~81; matching-pipeline line ~126; the "separate confirmed step / sole owner of substitutions.toml" line ~131). **Also correct line ~151's stale claim** that the build validates "`substitutions.toml` rules are well-formed" — `build-indexes.mjs` does not, and the file is being removed.

## 6. Specs + validation

- [x] 6.1 Confirm the capability deltas under `specs/` match the code: `ingredient-substitution` and `pantry-verification` REMOVED; `menu-generation`, `kroger-integration`, `data-write-tools`, `shared-corpus` MODIFIED.
- [x] 6.2 `openspec validate thin-pantry-and-substitution-path` passes.
- [x] 6.3 `npm test` and the menu-generation smoke test pass with the substitution surface removed.
