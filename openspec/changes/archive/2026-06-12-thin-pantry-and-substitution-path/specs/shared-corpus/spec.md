## MODIFIED Requirements

### Requirement: Shared reference data

The reference-data file `aliases.toml` SHALL live in the shared corpus and be read by all tenants. There is no shared `substitutions.toml` and no per-tenant substitution-override layer — ingredient substitution is LLM reasoning (over the loaded pantry for inventory subs, and over enumerated Kroger searches for sale subs), not a curated rules file. (`ingredients.toml` is likewise removed — freshness is LLM-judged, not driven by a shelf-life table.)

#### Scenario: Shared aliases apply to all tenants

- **WHEN** any tenant normalizes an ingredient term
- **THEN** the shared `aliases.toml` is consulted, identically for every tenant

#### Scenario: No substitutions reference file is present

- **WHEN** the shared corpus reference data is enumerated
- **THEN** there is no `substitutions.toml` at the root and no `users/<id>/substitutions.toml` override; substitution candidates are produced by agent reasoning, not read from a file
