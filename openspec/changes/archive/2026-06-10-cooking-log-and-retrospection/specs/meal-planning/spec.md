## ADDED Requirements

### Requirement: Transient meal plan of committed cook intent

The system SHALL maintain `meal_plan.toml` at the repo root as a transient, recipe-grain record of committed cook intent. Each `[[planned]]` entry SHALL carry a `recipe` slug and MAY carry an optional `planned_for` ISO date. The meal plan SHALL be distinct from `grocery_list.toml`: the grocery list is ingredient-grain and holds only items to buy, so a planned recipe whose ingredients are all already in the pantry SHALL still appear in `meal_plan.toml`. Entries SHALL be cleared as they resolve — removed when the recipe is cooked, or dropped when abandoned.

#### Scenario: Planned recipe recorded even when nothing must be bought

- **WHEN** the user agrees to cook a recipe whose ingredients are all in the pantry
- **THEN** a `[[planned]]` row for that recipe is written to `meal_plan.toml` even though nothing is added to `grocery_list.toml`

#### Scenario: Cooking clears the planned row

- **WHEN** a planned recipe is cooked and logged
- **THEN** its `[[planned]]` row is removed from `meal_plan.toml` in the same commit

### Requirement: Read the meal plan

The system SHALL provide a `read_meal_plan` tool returning the current `[[planned]]` entries so the agent can resume cook intent across sessions.

#### Scenario: Plan readable in a fresh session

- **WHEN** a new conversation begins and `meal_plan.toml` has planned entries
- **THEN** `read_meal_plan` returns those entries with their `recipe` slugs and any `planned_for` dates

### Requirement: Plan and cook modes

`AGENT_INSTRUCTIONS.md` SHALL define two operating modes. **Plan mode** SHALL cover the existing inventory, recipe, menu, and order behavior, and SHALL write `planned` rows on menu agreement. **Cook mode** SHALL be triggered by the user asserting they are making or have made a dish ("I'm making X", "I made X"), and SHALL walk the user through confirming the cook and updating inventory, including asking whether the last of consumed ingredients was used. The full hands-free, voice-guided step-by-step walkthrough is out of scope for this change and SHALL be deferred to a later Guided cook mode change; cook mode here SHALL be the minimal confirm-and-capture flow.

#### Scenario: Cook-intent utterance enters cook mode

- **WHEN** the user says "I'm making the arroz caldo"
- **THEN** the agent enters the minimal cook-capture flow: confirm the dish, prompt pantry decrements, ask about using the last of ingredients, and log the cook on completion

#### Scenario: Guided walkthrough is not attempted

- **WHEN** the user is in cook mode in this change
- **THEN** the agent performs confirm-and-capture and does NOT attempt timed step-by-step guidance (deferred)

### Requirement: Stale-planned reconcile at session start

When a session begins with **due** planned rows in `meal_plan.toml`, the agent SHALL surface them and ask whether any were cooked — structurally parallel to the order flow's stale-cart check. A row is **due** when its `planned_for` is on or before today, or when `planned_for` is unset; future-dated rows SHALL NOT trigger the reconcile. Recipes the user confirms cooked SHALL be logged and cleared; recipes the user abandons SHALL be dropped from the plan. The agent SHALL NOT silently assume planned recipes were cooked.

#### Scenario: Due plan prompts a reconcile

- **WHEN** a new session starts and `meal_plan.toml` has rows with `planned_for` on or before today (or unset)
- **THEN** the agent asks which were cooked, logs and clears the confirmed ones, and drops the abandoned ones

#### Scenario: Future-dated plan does not nag

- **WHEN** the only planned rows have a `planned_for` after today
- **THEN** the agent does not prompt a reconcile for them

#### Scenario: No silent promotion

- **WHEN** the user does not confirm cooking a due planned recipe
- **THEN** the agent leaves it unlogged (its `last_cooked` unchanged) rather than recording a cook
