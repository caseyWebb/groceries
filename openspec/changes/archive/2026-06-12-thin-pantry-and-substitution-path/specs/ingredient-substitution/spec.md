## REMOVED Requirements

### Requirement: propose_substitutions applies substitutions.toml rules deterministically

**Reason**: The deterministic substitution engine is removed. In real use the backing `substitutions.toml` is never curated, and the substitution *decision* always routed through the LLM + a user confirmation anyway (the tool only enumerated candidates). Candidate enumeration moves to LLM world knowledge, which handles messy real input better than a flat rule list. See `design.md` D1/D2.

**Migration**: Inventory substitutions become LLM reasoning over the pantry loaded up front in the `menu-generation` flow (see that capability's delta). Sale and unavailable-fallback substitutions become LLM-enumerated Kroger searches (`kroger_flyer` / `kroger_prices` with caller-supplied `terms`). Personal vetoes and ranked preferences are captured as `taste.md` prose. No data migration — the uncurated `substitutions.toml` files are deleted.

### Requirement: Inventory and sale modes

**Reason**: Removed with the tool. The mode split (pantry-present vs on-sale candidates) is no longer a tool parameter; the two moments are handled by distinct LLM flows (pantry reasoning vs Kroger search).

**Migration**: Inventory mode → LLM scans the loaded pantry during the menu pantry pass. Sale mode → LLM enumerates substitute candidates and passes them to `kroger_flyer`/`kroger_prices`.

### Requirement: Dormant until seeded

**Reason**: Removed with the tool. The "empty file → empty result" contract is moot once the file and tool are gone.

**Migration**: None. Absence of substitution rules is now the only state; substitution is LLM judgment, not a seeded table.

### Requirement: Structured errors in sale mode

**Reason**: Removed with the tool. The sale-mode Kroger fetch no longer exists as a substitution-specific path.

**Migration**: Kroger fetch errors continue to surface as structured errors through the `kroger-integration` tools (`kroger_flyer` / `kroger_prices`) the agent now calls directly with enumerated substitute terms.
