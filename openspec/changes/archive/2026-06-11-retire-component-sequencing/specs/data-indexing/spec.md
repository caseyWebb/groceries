## MODIFIED Requirements

### Requirement: Index build entry point

The system SHALL provide `scripts/build-indexes.mjs`, runnable via an npm script, that reads source data and writes the index artifacts. Its core walk SHALL accept an input directory as a parameter defaulting to `recipes/`, so the same logic can be exercised against a fixtures directory.

#### Scenario: Run against the default corpus

- **WHEN** the build script is run with no input-directory override
- **THEN** it reads from `recipes/` and writes `_indexes/recipes.json`

#### Scenario: Run against a fixtures directory

- **WHEN** the core walk is invoked with an input directory of `tests/fixtures/`
- **THEN** it produces indexes derived from the fixture recipes without reading the real `recipes/` directory

### Requirement: Empty corpus handling

The system SHALL handle an empty `recipes/` directory without error, emitting an empty index object.

#### Scenario: Empty recipes directory

- **WHEN** the build script runs and `recipes/` contains no `.md` files
- **THEN** `recipes.json` is written as `{}` and the script exits successfully

## REMOVED Requirements

### Requirement: Components index shape

**Reason:** The component model is retired — `suggest_sequencing` (its only consumer) was a no-op and is dropped, so `_indexes/components.json` is no longer emitted. Recipe content is now carried solely by `_indexes/recipes.json`.
