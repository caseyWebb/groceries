## MODIFIED Requirements

### Requirement: kroger_flyer synthesized sale scan

The system SHALL provide `kroger_flyer(filter)` that synthesizes a sale list by scanning two term sources and returning genuinely-discounted, fulfillable products deduplicated by `productId`: **precise** terms supplied by the caller (menu ingredients, stockup item names, and any substitute candidates the agent has enumerated from world knowledge) and **broad** curated terms read from `flyer_terms.toml`. The tool SHALL NOT itself derive substitution candidates from a rules file — there is no `against_substitutions` source; substitute terms, when wanted, are passed in by the caller as ordinary `terms`. A product SHALL be kept only when it is fulfillable (curbside or delivery), on sale (`promo > 0 && promo < regular`, excluding Kroger's `promo == regular` non-sale echo), AND marked down by at least `min_savings_pct` of the regular price — a `filter` parameter defaulting to 5%, so penny / near-zero markdowns are excluded while the caller owns the "what counts as a deal" threshold. Each kept product SHALL carry **every** scanned term that surfaced it (`matched_terms`), not only the first, so the caller can distinguish a stockup/menu match from a broad-category match. The result is explicitly non-exhaustive (the public API exposes no flyer/circular endpoint and no sort-by-discount); each term returns a bounded relevance-ranked page that MAY be paginated a few pages deep.

#### Scenario: Only genuine discounts are returned

- **WHEN** `kroger_flyer` runs
- **THEN** it keeps only fulfillable products on sale and marked down by at least `min_savings_pct` (default 5%) of the regular price, deduplicated by `productId`, dropping `promo == regular` echoes and penny markdowns

#### Scenario: Substitute candidates are scanned as caller-supplied terms

- **WHEN** the agent wants to check whether a salmon substitute is on sale
- **THEN** it enumerates candidates (e.g. trout, arctic char, mahi mahi) from world knowledge and passes them as `terms`, rather than the tool reading a substitutions file

#### Scenario: Each product carries all matching terms

- **WHEN** a product is surfaced by more than one scanned term (e.g. a precise stockup term and a broad category term)
- **THEN** it appears once with `matched_terms` listing every term that surfaced it, rather than collapsing to the first term

#### Scenario: Broad terms drive serendipitous discovery

- **WHEN** `flyer_terms.toml` contains broad category terms (e.g. `"fruit"`, `"frozen meals"`)
- **THEN** those terms are scanned in addition to precise context terms, surfacing sales beyond the caller's known item list

#### Scenario: Caller widens the discount floor

- **WHEN** the caller passes a `min_savings_pct` below (or above) the 5% default
- **THEN** the scan keeps products meeting that threshold instead, moving the deal judgment to the caller
