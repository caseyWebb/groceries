## MODIFIED Requirements

### Requirement: Side pairing bootstrap when the edge is empty

When a non-standalone main has an empty `pairs_with`, the agent SHALL bootstrap a pairing at plan time: it SHALL search for a suitable savory side, preferring existing corpus recipes (via `list_recipes`), then the RSS discovery pool (`fetch_rss_discoveries`), then a web import (`import_recipe`); it SHALL propose at most two candidate sides in chat; and on the user accepting a side it SHALL ensure the side exists as a recipe (importing it as a `status: draft` recipe via the discovery path when it does not already exist) and SHALL record the pairing by adding the side's slug to the main's `pairs_with` through `update_recipe`. The recorded edge is shared content, so a later menu request for the same main SHALL find the pairing already present and surface it without re-bootstrapping. The bootstrap SHALL select sides by plate fit.

#### Scenario: Empty pairs_with bootstraps a side

- **WHEN** a non-standalone main has an empty `pairs_with` and the user requests a menu including it
- **THEN** the agent searches corpus-then-RSS-then-web, proposes one or two savory sides, and asks the user to choose

#### Scenario: Accepted bootstrap imports the side and records the edge

- **WHEN** the user accepts a proposed side that is not yet in the corpus
- **THEN** the agent imports it as a `status: draft` recipe and adds its slug to the main's `pairs_with` in the same commit

#### Scenario: Recorded pairing is reused next time

- **WHEN** a later menu request includes the same main whose `pairs_with` now names the previously-recorded side
- **THEN** the agent surfaces the recorded side and does not re-run the bootstrap search

## REMOVED Requirements

### Requirement: Sequencing deferred to Change 13

**Reason:** The component model is retired and `suggest_sequencing` is dropped, so there is no deferred sequencing tool for the menu flow to tolerate the absence of. The agent may still note an obvious shared-perishable pairing conversationally — that behavior is covered by the menu-proposal reasoning requirements and the perishable-ingredient waste callout, not by a sequencing tool.
