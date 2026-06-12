## MODIFIED Requirements

### Requirement: Menu-request context pre-pass

On a menu request, the agent SHALL gather context by calling `read_pantry`, `read_preferences`, `read_taste`, `ready_to_eat_available`, and `kroger_flyer` together (in parallel) **before** assembling a proposal, so that pantry contents, sale data, ready-to-eat availability, preferences, and taste all inform the same proposal. The **raw pantry** (`read_pantry`) SHALL be loaded as a *selection* input — before recipes are chosen — so that what the member already has informs which recipes are proposed (and so the agent can spot inventory stand-ins by reasoning over it), not merely the post-selection buy list. There SHALL be no `verify_pantry_*` call: pantry matching, freshness, and inventory substitutions are the agent reasoning over the loaded pantry. `kroger_prices` is a *costing* input issued after a tentative menu exists (it needs the chosen ingredients), not part of the up-front selection batch.

#### Scenario: Open-ended request gathers selection context before proposing

- **WHEN** the user says "make me a menu"
- **THEN** the agent calls `read_pantry`, `read_preferences`, `read_taste`, `ready_to_eat_available`, and `kroger_flyer` before presenting any menu proposal, and issues no `verify_pantry_*` call

#### Scenario: Pantry informs selection, not just the buy list

- **WHEN** the member has salmon and bok choy on hand and makes an open-ended request
- **THEN** the agent reasons over the loaded pantry to favor recipes that use what is already on hand, before finalizing the proposed set

#### Scenario: Pantry confirmation pass is not skipped

- **WHEN** any menu request is made
- **THEN** the agent runs the comprehensive pantry confirmation pass (including staples and spices) by reasoning over the loaded pantry, rather than proposing a menu without considering pantry state

### Requirement: Full proposal assembly

The agent SHALL assemble a menu proposal that reasons over the gathered context and the user's original message, and SHALL incorporate, when applicable: freeform constraints (mood/cuisine/effort such as "comfort food," "something Italian," "I'm feeling lazy"); meal-prep callouts for `meal_preppable` recipes on the menu; **inventory substitutions** spotted by reasoning over the loaded pantry (a stand-in the member already has for a missing ingredient, surfaced during the pantry pass for confirmation before the item reaches the buy list); **sale-based substitution opportunities** (surfaced only after flyer/price data is available, with substitute candidates enumerated from the agent's world knowledge and priced via `kroger_flyer`/`kroger_prices`, never before); ready-to-eat opportunity buys; a staples restock list; and stockup alerts for bulk-buy items on sale. The proposal SHALL be sized to the user's cooking frequency (`default_cooking_nights`) unless the user specified otherwise.

#### Scenario: Inventory substitution is spotted from the loaded pantry

- **WHEN** a chosen recipe calls for salmon, salmon is in `not_in_pantry`, and the loaded pantry contains trout
- **THEN** the agent offers the trout as a stand-in for confirmation during the pantry pass, and on acceptance the salmon is not added to the buy list

#### Scenario: Freeform constraint shapes selection

- **WHEN** the user says "something comforting, I'm feeling lazy this week"
- **THEN** the proposal biases toward comforting and low-effort/meal-preppable recipes while still running the pantry pass and proposing a restock list

#### Scenario: Sale substitutions appear with the proposal, not during pantry verify

- **WHEN** a menu recipe calls for an ingredient whose substitute is on sale
- **THEN** the sale-based substitution is surfaced alongside the menu proposal (after flyer data), with the substitute candidates enumerated by the agent and priced via the Kroger tools, not during the pantry confirmation pass

#### Scenario: Proposal sized to cooking frequency

- **WHEN** the user makes an open-ended request and `default_cooking_nights` is 3
- **THEN** the agent proposes 3 cooking nights (not 5 with extras), unless the user asked for a different count

### Requirement: To-buy list assembled from recipe content and the loaded pantry

The to-buy list SHALL be produced by the agent reasoning over the chosen recipes' content and the loaded pantry, not by a `verify_pantry_*` tool. At the cost/confirm step the agent SHALL load each chosen recipe's full content (`read_recipe`) — which it needs to cook regardless — match the recipe's ingredients against the loaded pantry (treating semantic equivalents like `scallion`/`green onion` as on-hand, surfacing genuinely-absent items as to-buy), and emit the result directly as `grocery_list_ops`, attributing each item to the recipe(s) needing it. Presence-only stance holds: the agent SHALL NOT net quantities against the buy list (quantity reconciliation stays the order-placement partials flow). The buy list SHALL be confirmed conversationally before commit, so a missed or mismatched item is caught before it is persisted.

#### Scenario: To-buy comes from read_recipe + pantry reasoning, not a verify tool

- **WHEN** the user agrees to a menu and the agent assembles the buy list
- **THEN** the agent loads the chosen recipes via `read_recipe`, matches their ingredients against the loaded pantry, and emits `grocery_list_ops` for the absent items — issuing no `verify_pantry_*` call

#### Scenario: Semantic on-hand match avoids a needless buy

- **WHEN** a chosen recipe calls for `scallions` and the loaded pantry contains `green onions`
- **THEN** the agent treats it as on-hand (not added to the buy list), as a confirmable judgment rather than a string match
