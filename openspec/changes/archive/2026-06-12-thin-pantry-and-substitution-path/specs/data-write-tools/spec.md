## MODIFIED Requirements

### Requirement: Repo-data write tools

The system SHALL provide repo-data write tools that persist via the atomic commit engine, **routing each write to the repository that owns the data category** (see "Writes are routed by data category"): `update_recipe`, `update_pantry`, `mark_pantry_verified`, `add_draft_ready_to_eat`, `update_ready_to_eat`, the user-curated `update_*` tools (preferences, taste, diet principles, aliases), overlay and note write tools, and `commit_changes`. There SHALL be no `update_substitutions` tool. `commit_changes` SHALL accept a batch of repo updates and persist them in one commit per target repository with a single summarizing message. `commit_changes` SHALL accept a `grocery_list_ops` field — an array of `{ op: "add" | "update" | "remove", item?, name? }` operations against the caller's grocery list — applied as part of the same atomic commit as the batch's other domains. No tool in this capability SHALL write a Kroger cart or call an external service.

Ready-to-eat is **per-tenant personal state**: `add_draft_ready_to_eat` and `update_ready_to_eat` SHALL read and write the caller's `users/<username>/ready_to_eat.toml`, never a shared root catalog. Each ready-to-eat item SHALL be keyed by a generated `slug` (derived from its `name`, unique within the caller's file); `update_ready_to_eat` SHALL address items by `slug`. Items SHALL support an optional `rating` field. `add_draft_ready_to_eat` SHALL accept an optional `status` (default `draft`) so that an item the member explicitly names — e.g. during onboarding — can be added directly as `active` rather than as a draft to be dispositioned.

`grocery_list_ops` SHALL reuse the grocery-list merge semantics: an `add` for a name already present (including one added earlier in the same batch) MERGES rather than duplicating. An `update` or `remove` for a name not present SHALL be reported as a conflict in the tool result rather than aborting the commit (partial-apply), consistent with the other `*_ops` fields.

#### Scenario: Single update persists with confirmation

- **WHEN** `update_recipe(slug, updates)` is called with a valid slug and objective frontmatter fields
- **THEN** the shared recipe content is merged, committed to the shared corpus repo, and the tool returns `{ slug, updated_fields }`

#### Scenario: Subjective edit writes the caller's overlay, not shared content

- **WHEN** a tenant rates a shared recipe or marks it cooked
- **THEN** the change is written to that tenant's overlay in their per-tenant repo, and the shared recipe content is not modified

#### Scenario: No substitutions write tool exists

- **WHEN** the tool surface is enumerated
- **THEN** there is no `update_substitutions` tool, and `config_updates` does not accept a `"substitutions"` file

#### Scenario: Ready-to-eat write targets the caller's per-tenant catalog

- **WHEN** `add_draft_ready_to_eat` or `update_ready_to_eat` is called
- **THEN** the change is written to the caller's `users/<username>/ready_to_eat.toml`, keyed by the item's generated `slug`, and no shared root catalog is touched

#### Scenario: Onboarding adds an active item directly

- **WHEN** `add_draft_ready_to_eat` is called with `status = "active"` for an item the member named
- **THEN** the item is added to the caller's catalog as `active` (not `draft`) with a generated `slug`

#### Scenario: Unknown target is structured, not thrown

- **WHEN** `update_ready_to_eat` is called with a `slug` that no item in the caller's catalog resolves to
- **THEN** the tool returns a structured error rather than throwing

#### Scenario: Grocery-list ops land in the same commit as the rest of the batch

- **WHEN** `commit_changes` is called with `grocery_list_ops` alongside `meal_plan_ops` and `pantry_operations`
- **THEN** the grocery-list mutations and the other domains' mutations are persisted in a single commit, and the result summary reports what was applied per domain

#### Scenario: A missing-name grocery op is a reported conflict, not an aborted commit

- **WHEN** `grocery_list_ops` contains a `remove` (or `update`) for a name absent from the list
- **THEN** that op is reported as a conflict in the result and the remaining ops (and the rest of the batch) are still committed

### Requirement: User-curated config writes are content-faithful

The user-curated `update_*` tools (`taste`, `diet_principles`, `preferences`, `aliases`) SHALL write exactly the content supplied by the caller to the corresponding curated file and SHALL NOT infer or merge additional changes. There is no `update_substitutions` tool. The discipline of *when* these may be called (only on explicit user direction) is documented in `AGENT_INSTRUCTIONS.md`; the tools themselves are unconditional writers of provided content.

#### Scenario: Curated write persists provided content verbatim

- **WHEN** `update_preferences(updates)` is called with a directed edit
- **THEN** the tool writes the provided content to `preferences.toml` via the atomic commit and returns confirmation, without adding inferred changes

### Requirement: Writes are routed by data category

The system SHALL route each write to the correct location within the single data repo by data category: objective recipe **content** and shared reference/SKU data SHALL be written at the repo **root** (`recipes/`, reference files, `skus/`); per-tenant **overlay** (`rating`/`status`), **notes**, personal recipes, and personal state (pantry, preferences, taste, diet_principles, grocery_list, stockup, cooking_log) SHALL be written under the caller's **`users/<username>/`** subtree. There is no per-tenant substitution-override file. A subjective-field change to a shared recipe SHALL NOT modify shared content. (`last_cooked` is not written as overlay — it is realized by appending to the caller's `users/<username>/cooking_log.toml`.)

#### Scenario: Content edit targets the shared root

- **WHEN** an objective edit to a shared recipe's content is persisted
- **THEN** it is committed to `recipes/` at the data-repo root

#### Scenario: Overlay, notes, and personal state target the user subtree

- **WHEN** a tenant's rating, note, pantry change, or preference edit is persisted
- **THEN** it is committed under that tenant's `users/<username>/` subtree, never to the shared root or another member's subtree
