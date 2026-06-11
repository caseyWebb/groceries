## 1. Build tooling (`scripts/`)

- [x] 1.1 `build-indexes.mjs`: stop building the components adjacency and stop writing `_indexes/components.json`; drop the unresolved-component-reference hard-fail; drop `uses_components`/`produces_components` from the emitted recipe object; `buildRecipeIndexes` returns `{ recipes, errors, warnings }`; `run()` returns `{ indexes: { recipes } }`.
- [x] 1.2 `build-site.mjs`: remove `renderComponents`, the `componentsPath` plumbing, and the components arg to `renderRecipePage`; drop the components.json read.
- [x] 1.3 `site-assets/style.css`: remove the `.components` rules.

## 2. Tests + fixtures

- [x] 2.1 `tests/build-indexes.test.mjs`: drop component-adjacency assertions, the unresolved-component hard-fail test, and the "producing a component with no consumer is allowed" test.
- [x] 2.2 `tests/build-site.test.mjs`: drop the `renderComponents` tests and the `componentsPath` args.
- [x] 2.3 `tests/fixtures/recipes/*.md`: strip `uses_components` / `produces_components` frontmatter from the three fixtures.
- [x] 2.4 `npm run test:tooling` passes.

## 3. Docs (developer-facing)

- [x] 3.1 `docs/TOOLS.md`: remove the `suggest_sequencing` section / "Sequencing tools" group.
- [x] 3.2 `docs/SCHEMAS.md`: remove `uses_components` / `produces_components` from the recipe frontmatter + notes.
- [x] 3.3 `docs/PROJECT.md`: remove the components frontmatter, the sequencing pass, `suggest_sequencing` from the tool example, `_indexes/components.json` from the repo tree + indexing/validation sections.

## 4. Agent persona + plugin

- [x] 4.1 `AGENT_INSTRUCTIONS.md`: de-reference component sequencing in the meal-plan flow (drop the "do not reason over produces/uses_components" clause, the `suggest_sequencing`/Change 13 parenthetical, and "or sequence perishables").
- [x] 4.2 Regenerate the `plugin/` bundle via `npm run build:plugin` (`--mcp-url https://groceries-mcp.caseywebb.xyz/mcp`).

## 5. Specs

- [x] 5.1 `data-indexing`: drop `_indexes/components.json` from the entry-point + empty-corpus scenarios; remove the Components index shape requirement.
- [x] 5.2 `data-validation`: drop the unresolved-component hard-fail rule + scenario and the `uses_components`/`produces_components` mention in the warn-only rule.
- [x] 5.3 `recipe-site`: remove the Component cross-links requirement.
- [x] 5.4 `build-automation`: the index Action no longer regenerates `components.json`.
- [x] 5.5 `shared-corpus`: drop `uses/produces_components` from the objective-content enumeration.
- [x] 5.6 `recipe-import`: replace the component-reconciliation requirement with a near-duplicate-only one.
- [x] 5.7 `menu-generation`: remove the "Sequencing deferred to Change 13" requirement and the component-graph clause from the side-pairing bootstrap.

## 6. Validate

- [x] 6.1 `openspec validate retire-component-sequencing --strict` passes.
- [x] 6.2 `npm run typecheck`, `npm test`, and `npm run test:tooling` all pass.
