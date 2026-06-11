## MODIFIED Requirements

### Requirement: Order lifecycle with user-asserted transitions

The Kroger order lifecycle SHALL be `active → in_cart → ordered → received`. `place_order` SHALL advance resolved items to `in_cart`. Because the Kroger cart API is write-only and unreadable, transitions past `in_cart` SHALL be **user-asserted**, never agent-verified: an "I placed the order" assertion advances `in_cart → ordered`; an "I picked up the groceries" assertion advances `ordered → received`. The agent SHALL NOT claim an order was placed or received without the user's assertion.

The terminal `received` behavior — remove the item from the list and, for `grocery`-kind items only, restock the corresponding `pantry.toml` quantity (and offer storage tips for fresh perishables) — SHALL be **fulfillment-mode-agnostic**: it is the shared completion of *both* the Kroger online flush and the in-store walk (see the `in-store-fulfillment` capability). The in-store walk advances picked `grocery`-kind items directly `active → received`, with no `in_cart` / `ordered` stage, reusing this same restock behavior. `household` / `other` items never touch the pantry on either path.

#### Scenario: place_order marks items in_cart

- **WHEN** `place_order` adds resolved items to the cart
- **THEN** those grocery-list items advance to `status: in_cart`

#### Scenario: Pickup restocks the pantry and clears the list

- **WHEN** the user asserts "I picked up the groceries"
- **THEN** the ordered items are removed from the grocery list and `grocery`-kind items restock their pantry entries; `household`/`other` items do not touch the pantry

#### Scenario: In-store walk completes via the same received behavior

- **WHEN** an in-store walk finishes and its picked `grocery`-kind items advance directly `active → received`
- **THEN** those items are removed from the list and restock their pantry entries — the same terminal behavior as a Kroger pickup, without passing through `in_cart` or `ordered`

#### Scenario: Stale-cart reminder on a new order

- **WHEN** a new order begins while the prior list still has `in_cart` items never confirmed `ordered`
- **THEN** the agent reminds the user to clear the Kroger cart manually before proceeding, rather than silently double-adding
