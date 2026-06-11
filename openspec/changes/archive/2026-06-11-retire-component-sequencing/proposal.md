## Why

The recipe-component model was always two halves: a **producer** (the
`uses_components` / `produces_components` frontmatter, the `_indexes/components.json`
adjacency, the build-time resolution check, and the site cross-links) and a
**consumer** (`suggest_sequencing`, which would walk that adjacency to suggest
"batch the rice Monday, reuse it Thursday"). Only the producer ever shipped. The
consumer was deferred to roadmap Change 13, which is now a **no-op**: across the real
corpus essentially no recipe declares a component (the component bar — a standalone
make-ahead prep worth making on its own — is high enough that soffritto/béchamel
don't qualify), so a sequencing tool would return `[]` for every real input and the
vocabulary it needs would never seed.

That leaves the producer infrastructure as dead weight: a `_indexes/components.json`
nothing reads, a hard-fail validation rule guarding references no recipe makes, and
recipe-site cross-links that never render. It costs build time, test surface, and —
worse — it's documented across seven living specs as shipped, required behavior,
giving the false impression that component sequencing is a feature of the system. We
are retiring the whole model rather than carrying inert scaffolding into the release
candidate.

`pairs_with` (the *plating* edge) is **unaffected** — it is a separate, live feature
(side-dish pairings) that never depended on the component graph.

## What Changes

- **Remove the `uses_components` / `produces_components` recipe frontmatter** from the
  documented schema and the objective-content enumeration. (Existing recipes that
  still carry empty arrays parse harmlessly; the fields are simply no longer indexed,
  validated, or documented.)
- **Stop emitting `_indexes/components.json`** from `scripts/build-indexes.mjs` and the
  index-regeneration Action.
- **Drop the unresolved-component-reference hard-fail** from index validation.
- **Drop the recipe-site component cross-links** (`renderComponents`).
- **Drop the import-time component-reconciliation pass** (the near-duplicate-surfacing
  half of that requirement is retained — it never depended on components).
- **Remove `suggest_sequencing`** from the tool contract and the menu-generation flow,
  and delete the "sequencing arrives with Change 13" framing from `AGENT_INSTRUCTIONS.md`
  and the menu-generation spec.
- Code, tests, and `docs/` (`PROJECT.md`, `SCHEMAS.md`, `TOOLS.md`) are already updated
  in this branch; this change records the spec deltas that match them and the
  remaining doc/plugin tasks.

## Capabilities

### New Capabilities
<!-- None — this retires behavior from existing capabilities. -->

### Modified Capabilities
- `data-indexing`: stops emitting `_indexes/components.json`; the entry-point and
  empty-corpus scenarios no longer mention it.
- `data-validation`: drops the unresolved-component hard-fail rule + scenario, and the
  `uses_components`/`produces_components` mention from the warn-only soft rule.
- `recipe-site`: removes the component cross-links requirement entirely.
- `build-automation`: the index Action no longer regenerates `components.json`.
- `shared-corpus`: drops `uses/produces_components` from the enumerated objective
  recipe-content fields.
- `recipe-import`: the reconciliation requirement keeps near-duplicate surfacing but
  drops the component-wiring pass.
- `menu-generation`: removes the "sequencing deferred to Change 13" requirement and the
  component-graph deferral clause from the side-pairing bootstrap.

### Removed Capabilities
<!-- None — capabilities remain; only component sub-behaviors are retired. -->

## Impact

- **Code (already applied in this branch):** `scripts/build-indexes.mjs` (no components
  index, no resolution check), `scripts/build-site.mjs` (no `renderComponents`),
  `scripts/site-assets/style.css` (no `.components` rules), `tests/build-indexes.test.mjs`
  + `tests/build-site.test.mjs` (component assertions removed), three
  `tests/fixtures/recipes/*.md` (component frontmatter stripped). `src/` is untouched —
  `suggest_sequencing` was never implemented there.
- **Docs (already applied):** `docs/PROJECT.md`, `docs/SCHEMAS.md`, `docs/TOOLS.md`.
- **Agent persona:** `AGENT_INSTRUCTIONS.md` meal-plan flow de-references component
  sequencing; regenerate the `plugin/` bundle via `npm run build:plugin`.
- **Data repos:** a stale `_indexes/components.json` left in a data repo is inert and
  removed on the next index rebuild; no migration required. Recipes carrying empty
  `uses_components`/`produces_components` arrays are harmless and need no edit.
- **Out of scope:** `pairs_with` plating edges (live, unaffected); the
  `build-automation` spec's pre-existing `build-indexes.yml` vs. `data-build-indexes.yml`
  workflow-name drift (untouched here).
