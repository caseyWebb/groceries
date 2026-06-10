## MODIFIED Requirements

### Requirement: Capture to grocery list, never flush to cart

On agreement, the agent SHALL persist the menu's to-buy items to `grocery_list.toml` via `commit_changes`/`add_to_grocery_list` (ingredient-level, SKU-free), and SHALL record the agreed recipes as `[[planned]]` rows in `meal_plan.toml` (committed cook intent), setting `planned_for` to the intended cooking night when known, along with side effects such as pantry verifications. The agent SHALL NOT bump `last_cooked` on menu agreement — `last_cooked` moves only when a cook is asserted and logged (see the cooking-history capability). The menu flow SHALL NOT call `place_order` or otherwise write the Kroger cart. Cart population SHALL occur only on an explicit order request (Change 06b).

#### Scenario: Agreed menu captures intent without touching the cart

- **WHEN** the user agrees to a proposed menu
- **THEN** the agent commits the to-buy items to `grocery_list.toml`, writes the agreed recipes to `meal_plan.toml`, and does NOT call `place_order` or write the Kroger cart

#### Scenario: Agreement does not record a cook

- **WHEN** the user agrees to a proposed menu
- **THEN** no `cooking_log.toml` entry is appended and no recipe's `last_cooked` is changed

#### Scenario: Empty-cart case is stated explicitly

- **WHEN** the pantry already covers everything the agreed menu needs
- **THEN** the agent says so explicitly, commits any pantry verifications, writes the agreed recipes to `meal_plan.toml`, and adds nothing to `grocery_list.toml`

## ADDED Requirements

### Requirement: Soft variety honoring backed by real history

Menu generation SHALL honor the variety targets and restrictions in `diet_principles.md` **softly**: it SHALL bias proposals toward satisfying the principles, and SHALL explain the tradeoff when it cannot satisfy all of them rather than silently violating or rigidly enforcing them. The agent SHALL ground variety reasoning in real cooking history via `retrospective` (e.g. recent protein/cuisine mix, cadence) rather than intent alone. Restrictions declared as hard exclusions SHALL be treated as gates; variety targets SHALL be treated as soft preferences.

#### Scenario: Variety target shapes the proposal with explanation

- **WHEN** `diet_principles.md` targets fish at least once a week and `retrospective` shows no fish cooked recently
- **THEN** the proposal favors including a fish dish, and if it cannot, the agent explains why

#### Scenario: Hard restriction is not violated

- **WHEN** `diet_principles.md` declares a hard exclusion
- **THEN** the proposal never includes a recipe violating that exclusion

#### Scenario: Variety reasoning uses cooked history, not plans

- **WHEN** the agent reasons about recent protein/cuisine balance
- **THEN** it derives the balance from `retrospective` over `cooking_log.toml` (cooked events), not from `meal_plan.toml` intent

### Requirement: Favored ready-to-eat re-order suggestions

During a menu request, the agent SHALL cross-reference `retrospective`'s `ready_to_eat_favorites` against on-hand stock in `pantry.toml` and surface a restock suggestion for favored ready-to-eat items that are low or out. The suggestion SHALL be a prompt, never an automatic add. On the user's agreement, the agent SHALL write the item to `grocery_list.toml` (committed buy intent) or to `stockup.toml` (a conditional bulk-buy), per the user's choice.

#### Scenario: Favored-but-out item is suggested for restock

- **WHEN** a ready-to-eat item appears frequently in `ready_to_eat_favorites` and its `pantry.toml` stock is low or zero
- **THEN** the agent suggests restocking it during the menu request and adds it to `grocery_list.toml` only on agreement

#### Scenario: Well-stocked favorite is not pushed

- **WHEN** a favored ready-to-eat item still has adequate on-hand stock in `pantry.toml`
- **THEN** the agent does not surface a restock suggestion for it

#### Scenario: Suggestion never auto-adds

- **WHEN** the agent surfaces a restock suggestion
- **THEN** nothing is written to `grocery_list.toml` or `stockup.toml` until the user agrees
