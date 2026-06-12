# kroger-integration Specification

## Purpose

Defines the read-side Kroger integration for the MCP server: the `client_credentials` API client (token caching, rate-limit backoff, structured upstream errors), location resolution to a `locationId`, the internal `kroger_search` product helper, and the curated read tools built on it (`kroger_prices`, `kroger_flyer`, `ready_to_eat_available`). Also defines the user-curated `flyer_terms.toml` config that drives broad serendipitous sale scans. No `authorization_code` grant, cart writes, or persistent storage — those are deferred to a later change.
## Requirements
### Requirement: Kroger client_credentials API client

The system SHALL provide a Kroger API client that authenticates with the `client_credentials` OAuth grant using a client ID and secret supplied as Worker secrets. The client SHALL cache the access token in isolate memory and re-mint it on expiry rather than minting per request. On `429` responses the client SHALL honor `Retry-After` when present and otherwise apply exponential backoff with jitter. The client SHALL bound the number of concurrent in-flight Kroger HTTP requests it issues to a small fixed limit, so that a caller fanning out many lookups (e.g. `kroger_flyer` across dozens of terms) cannot issue an unbounded request burst; requests beyond the limit SHALL wait for an in-flight request to complete before being issued. Upstream failures SHALL surface as structured errors (`upstream_unavailable`), never unhandled throws. The client SHALL NOT use the `authorization_code` grant or any persistent storage (those are deferred to a later change).

#### Scenario: Access token reused across calls

- **WHEN** two Kroger read tools run within one access-token lifetime
- **THEN** the client mints one `client_credentials` token and reuses it rather than requesting a new token per call

#### Scenario: Rate-limit backoff

- **WHEN** the Kroger API returns `429`
- **THEN** the client honors `Retry-After` (or backs off exponentially with jitter when absent) and retries before surfacing a structured error

#### Scenario: Concurrent requests are capped

- **WHEN** a single tool fans out more concurrent Kroger lookups than the client's concurrency limit
- **THEN** at most `limit` requests are in flight at any moment and the remainder are issued only as in-flight requests complete, never as one unbounded burst

#### Scenario: Upstream failure surfaces structured

- **WHEN** the Kroger API is unreachable or errors after retries are exhausted
- **THEN** the tool returns a structured `upstream_unavailable` error and does not throw

### Requirement: Location resolution

The system SHALL resolve `preferences.toml`'s `preferred_location` label to a Kroger `locationId` via the Locations API and cache it in isolate memory. Every priced product call SHALL include a `locationId`, since the Products API returns pricing only when a location is supplied.

#### Scenario: Label resolved before priced calls

- **WHEN** a priced Kroger tool runs and no `locationId` is cached
- **THEN** the system resolves `preferred_location` to a `locationId` via the Locations API and uses it on the product search

#### Scenario: Resolved location reused

- **WHEN** subsequent priced calls run within the isolate
- **THEN** the cached `locationId` is reused without re-resolving

### Requirement: kroger_search internal product search

The system SHALL provide an internal `kroger_search` helper that queries the Products API by term and `locationId` (and curbside/delivery fulfillment), returning candidate products with `price { regular, promo }`, `size`, `brand`, and fulfillment flags. This helper SHALL NOT be exposed as a raw MCP tool; the curated Kroger tools and the matching pipeline call it internally.

#### Scenario: Search returns priced candidates

- **WHEN** `kroger_search` is called with a term and the resolved `locationId`
- **THEN** it returns candidate products each carrying `price { regular, promo }`, `size`, `brand`, and curbside/delivery fulfillment flags

### Requirement: kroger_prices for an ingredient list

The system SHALL provide `kroger_prices(ingredients)` returning, per ingredient, the current `{ regular, promo }` price, on-sale flag, and curbside/delivery availability at the resolved location.

#### Scenario: Prices returned per ingredient

- **WHEN** `kroger_prices` is called with a list of ingredient strings
- **THEN** it returns one priced result per ingredient including current price, on-sale state, and curbside/delivery availability

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

### Requirement: ready_to_eat_available by curbside/delivery fulfillment

The system SHALL provide `ready_to_eat_available()` that cross-references the **caller's** per-tenant `users/<username>/ready_to_eat.toml` catalog against current Kroger availability, where "available" means the item is fulfillable via curbside or delivery (`fulfillment.curbside || fulfillment.delivery`) at the resolved location. The system SHALL NOT claim live in-store stock, which the public API does not expose. When the caller has no catalog file (or an empty one), the tool SHALL return an empty availability result rather than erroring.

#### Scenario: Availability partitioned by fulfillment

- **WHEN** `ready_to_eat_available` runs
- **THEN** the caller's catalog items fulfillable via curbside or delivery are returned as available and the rest as unavailable

#### Scenario: Empty or absent catalog returns empty

- **WHEN** `ready_to_eat_available` runs for a caller whose `users/<username>/ready_to_eat.toml` is absent or empty
- **THEN** the tool returns an empty availability result without error

### Requirement: flyer_terms.toml curated config

The system SHALL read broad scan terms from a user-curated `flyer_terms.toml`. The agent SHALL treat it as edit-only-when-directed (the user-curated bucket) and SHALL NOT infer or write terms automatically. Its schema SHALL be documented in `docs/SCHEMAS.md`.

#### Scenario: Missing config degrades gracefully

- **WHEN** `flyer_terms.toml` is absent or empty
- **THEN** `kroger_flyer` still runs over the precise context terms and returns a (smaller) sale list rather than erroring

