## REMOVED Requirements

The `pantry-verification` capability is retired in full. The pantry now enters context via `read_pantry` (loaded up front as a menu-generation selection input), and the deterministic parse → normalize → match → bucket work moves into LLM reasoning over the loaded pantry and the chosen recipes' content (`read_recipe`), with the to-buy list emitted directly as `grocery_list_ops`. The shared rationale below applies to every removed requirement; per-requirement notes call out anything specific.

**Shared reason**: `verify_pantry_for_recipe` / `verify_pantry_for_candidates` composed parsing, alias normalization, exact/fuzzy matching, and age math deterministically — every piece is replaceable by LLM reasoning once both sides are in context (the pantry via `read_pantry`, the recipe ingredients via `read_recipe`, which the agent loads to cook anyway). Semantic matching ("scallion ≈ green onion") improves; the only loss is exhaustive bucketing, which is low-stakes (a missed item is caught by the iterate-before-commit step) and consistent with the thin-tools direction. Consumer check confirms no other dependency: `place_order` uses `grocery_list ∪ caller-supplied menu_needs` (it never parsed recipes), and `perishable_ingredients` classification has its own normalization — so the recipe-ingredient parser is removed with the tools.

**Shared migration**: Inventory presence, fuzzy candidates, freshness, inventory substitutions, and the to-buy list are now produced by the `menu-generation` flow reasoning over the loaded pantry + `read_recipe` content (see that capability's delta). `mark_pantry_verified` is unaffected (separate write tool); its trigger shifts to the agent reasoning over the loaded pantry's age fields.

### Requirement: Recipe-ingredient parsing

**Reason**: The deterministic ingredient-line parser (`recipe-ingredients.ts`) had no consumer but `verify`; with `verify` retired, the LLM parses the loaded recipe body directly. See shared reason.

**Migration**: See shared migration.

### Requirement: Optional-ingredient detection

**Reason**: Optional-ingredient handling moves to LLM reasoning over the loaded recipe content. See shared reason.

**Migration**: The agent recognizes optional ingredients while reading the recipe and asks before adding them to the buy list, as today — now without a tool bucket.

### Requirement: verify_pantry_for_recipe walks a recipe against the pantry

**Reason**: Tool retired. See shared reason.

**Migration**: See shared migration.

### Requirement: Facts not freshness verdicts (no have_stale bucket)

**Reason**: Tool retired. Freshness was already an agent judgment over age metadata; that judgment now reads the loaded pantry's `added_at` / `last_verified_at` / `prepared_from` directly.

**Migration**: See shared migration.

### Requirement: Exact-vs-fuzzy matching never guesses

**Reason**: Tool retired. The exact/fuzzy distinction becomes LLM reasoning over the loaded pantry — which surfaces semantic matches string-fuzzy could not, still confirmed conversationally rather than auto-applied.

**Migration**: See shared migration.

### Requirement: Presence-only, no quantity sufficiency

**Reason**: Tool retired. The presence-only stance (no quantity netting) carries forward as agent behavior; quantity reconciliation remains the order-placement partials flow's job, unchanged.

**Migration**: See shared migration.

### Requirement: verify_pantry_for_candidates aggregates with attribution

**Reason**: Tool retired. Cross-recipe dedup and `for_recipes` attribution become bookkeeping the agent does over the small chosen recipe set while assembling `grocery_list_ops`.

**Migration**: See shared migration.

### Requirement: Structured errors and empty-data resilience

**Reason**: Tool retired; its error cases (unknown slug, missing `## Ingredients`, empty pantry) no longer exist as a tool boundary. `read_recipe` / `read_pantry` retain their own structured-error conventions.

**Migration**: See shared migration.
