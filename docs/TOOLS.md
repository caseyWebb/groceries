# TOOLS.md — MCP Tool Inventory

The complete tool surface exposed by `grocery-mcp` to Claude. Each tool encodes a deterministic operation. The LLM composes them; the tools enforce the pipelines.

## Design philosophy

**Coarse and opinionated.** Tools wrap multi-step deterministic logic so the LLM doesn't have to orchestrate every step. `match_ingredient_to_kroger_sku` runs the full 7-step matching pipeline internally; the LLM doesn't construct Kroger queries directly.

**Structured output via JSON.** Every tool returns structured data. The LLM reasons over the result; it doesn't parse free text.

**Honest about ambiguity.** When deterministic narrowing leaves multiple options (e.g., 3 brands of olive oil all match equally), tools return `ambiguous: true` with candidates. The LLM either picks based on context or asks the user. Tools don't silently pick.

**No raw building blocks exposed.** No `kroger_raw_search`, no `github_raw_write`, no `cart_add_by_name`. These would let the LLM bypass the deterministic pipelines.

---

## Recipe tools

### `list_recipes(filters)`

List recipes matching filters. Reads from `_indexes/recipes.json` (single API call).

**Params:**
- `filters` (object, optional): `{ status?, protein?, cuisine?, query?, season?, dietary?, max_time_total?, not_cooked_since?, exclude_cooked_within_days? }`

**Returns:**
- `{ recipes: [{ slug, title, frontmatter }] }` — array of matched recipes with frontmatter

**Notes:**
- Default `status: active`. Use `status: draft` to see discoveries awaiting disposition, or `status: "all"` to opt out of status filtering entirely.
- Array filters (`dietary`, `season`) match **all** listed values (AND/narrowing). **There is no `tags` filter** — keyword/tag matching is done by `query`.
- `query` (string): the single name/keyword search over `title` **and** `tags`. Tokenize on whitespace, drop connective stopwords (`and`, `or`, `with`, `the`, `a`, `an`, `of`, `in`, `on`, `for`, `&`), then keep a recipe when **every** remaining token is a case-insensitive substring of its `title` or any `tag` (token-AND). Deterministic membership only — no ranking, scoring, or fuzzy matching. So `"chicken and rice"` ≡ `"chicken rice"` and surfaces a recipe titled "Chicken and Rice" even when its tags omit "rice". ANDed with the other filters; an absent, empty, or all-stopword `query` applies no text narrowing.
- `exclude_cooked_within_days` (number): drop recipes cooked within the last N days. Caller-supplied window, not a stored default.
- `not_cooked_since` (date): recipes with `last_cooked: null` (never cooked) **pass** this filter.

### `read_recipe(slug)`

Read a single recipe's full content (frontmatter + body).

**Params:**
- `slug` (string, required)

**Returns:**
- `{ slug, frontmatter, body }`

### `update_recipe(slug, updates)`

Update recipe frontmatter fields. Use for `last_cooked`, `rating`, `status` transitions, and any other frontmatter edits the user has directed.

**Params:**
- `slug` (string, required)
- `updates` (object): partial frontmatter to merge

**Returns:**
- `{ slug, updated_fields }` — confirmation of what was changed

**Notes:** Side-effect updates (last_cooked, rating, status) happen during normal flow. Other frontmatter edits require user direction.

### `import_recipe(url)`

**Parse-only.** Fetch a recipe page, extract its schema.org `Recipe` JSON-LD, and return the structured data. Writes nothing and commits nothing — the agent cleans/classifies the data, assembles the markdown body, then persists via `create_recipe`.

**Params:**
- `url` (string, required)

**Returns:**
- `{ title, ingredients: [...], instructions: [...], servings, time_total, time_active, source }` — `ingredients`/`instructions` are string arrays; `servings` is a scalar (number when parseable); `time_total`/`time_active` are minutes or null; `source` is the recipe's canonical URL.

**Errors (structured):**
- `{ error: "unreachable" }` — the page couldn't be fetched (network error or non-2xx). Bot-walled/paywalled sites (Serious Eats, NYT, Food52) land here — paste the recipe instead.
- `{ error: "no_jsonld" }` — no `<script type="application/ld+json">` on the page.
- `{ error: "not_a_recipe" }` — JSON-LD present but no schema.org `Recipe`.
- `{ error: "incomplete", missing: [...] }` — a `Recipe` was found but yielded no ingredients and/or no instructions.

**Notes:** Handles JSON-LD in `@graph`, top-level arrays, multiple script blocks, `@type` as string or array, and instructions as `HowToStep`/`HowToSection`/plain strings (`HowToTip` notes are skipped). The agent owns the judgment fields (protein, cuisine, tags, dietary, `ingredients_key`, `meal_preppable`) when assembling frontmatter for `create_recipe`.

### `create_recipe(frontmatter, body, slug?)`

Write a **new** recipe markdown file (`recipes/<slug>.md`) from agent-assembled frontmatter + body, as **one solo commit**. The slug derives from the title unless `slug` is supplied. The body MUST contain `## Ingredients` and `## Instructions` H2 sections (guarded — a body missing them is rejected, never committed).

**Params:**
- `frontmatter` (object, required) — full recipe frontmatter. `status` defaults to `draft` if omitted, so discovery imports never land active by accident; discovery should also set `discovered_at` and `discovery_source`.
- `body` (string, required) — markdown body with the `## Ingredients` / `## Instructions` sections.
- `slug` (string, optional) — overrides the title-derived slug.

**Returns:**
- `{ slug, commit_sha }`

**Errors (structured):**
- `{ error: "slug_exists", slug }` — a recipe already exists at that path; not overwritten.
- `{ error: "validation_failed" }` — no derivable slug (missing title), or the body lacks the required H2 sections.

**Notes:** The everyday discovery write path: `import_recipe` (parse) → agent cleans/classifies → `create_recipe`. Disposition of the resulting draft happens later via `update_recipe` (→ `active` + rating, or `rejected`).

---

## Pantry tools

### `read_pantry(filter)`

Read pantry items, optionally filtered.

**Params:**
- `filter` (object, optional): `{ category?, prepared_only?, stale_only? }`

**Returns:**
- `{ items: [...] }` — array of pantry items per schema

**Notes:** `category` and `prepared_only` are deterministic from pantry data. `stale_only` depends on shelf-life thresholds from `ingredients.toml`, which doesn't exist until Change 12 — until then it returns a structured `{ error: "unsupported" }` rather than guessing.

### `verify_pantry_for_recipe(slug)`

Parse the named recipe's `## Ingredients` and walk each against the pantry. Returns **facts, not freshness verdicts** — the tool reports what's present and surfaces age metadata; the agent decides which items warrant a "still good?" prompt (resolved via `mark_pantry_verified`). The tool never classifies items as fresh/stale (it has no shelf-life data and freshness depends on storage, not age) and never guesses ambiguous matches.

**Params:**
- `slug` (string, required)

**Returns:**
```
{
  in_pantry: [...{                  // exact normalized match — confident
    recipe_calls_for,               // parsed ingredient name
    pantry_item,                    // matched pantry entry name
    added_at, last_verified_at,
    days_since_verified,            // for the agent's freshness-prompt judgment
    category,                       // when present on the pantry item
    prepared_from                   // slug if a cooked/prepared leftover
  }],
  possible_matches: [...{           // fuzzy/token-overlap candidate — AGENT CONFIRMS. ALL plausible
    recipe_calls_for,               //   candidates per ingredient are listed (one entry each),
    candidate_pantry_item           //   containment matches first; confirm → treat as in_pantry (suggest an aliases.toml entry)
  }],
  not_in_pantry: [...{ ingredient }],  // no candidate at all → to-buy list (presence-driven, never quantity-netted)
  optional: [...ingredients],       // names of parsed "(optional ...)" ingredients — non-blocking; ask before adding to order
  inventory_substitutes_available: [...{ recipe_calls_for, available_substitute }]  // ∅ until substitutions.toml seeded
}
```

**Notes:** No `have_stale` bucket — freshness is an agent judgment over the surfaced age metadata, not a tool output. Matching is exact for `in_pantry`; anything inexact goes to `possible_matches` for the agent to confirm or reject (no silent false-misses, no silent false-positives) — **every** plausible pantry candidate for an ingredient is surfaced (not just the first), ranked containment-first, so the agent decides among the full set (coarse deterministic search → LLM narrows). `inventory_substitutes_available` applies `substitutions.toml` rules and is empty until rules are seeded. Change 12 may later add a `past_typical_fresh_life` hint per item (from `ingredients.toml`) without changing this shape.

### `verify_pantry_for_candidates(slugs)`

Same as above but for multiple candidate recipes (for open-ended menu requests). Aggregates the picture, deduped by parsed ingredient name.

**Params:**
- `slugs` (array of strings, required)

**Returns:** Same shape as above, aggregated. Each `not_in_pantry`, `possible_matches`, and `inventory_substitutes_available` entry additionally carries `for_recipes: [...slugs]` — the candidate recipe(s) that need it — mirroring `grocery_list.toml`'s attribution and what `place_order` consumes.

### `update_pantry(operations)`

Apply pantry updates from conversational messages.

**Params:**
- `operations` (array): `[{ op: "add" | "remove" | "verify", item: ..., ... }]`

**Returns:**
- `{ applied: [...], conflicts: [...] }`

**Notes:** Conflicts surface when remove targets aren't found. The agent should ask the user how to resolve.

### `mark_pantry_verified(items)`

Reset `last_verified_at` on confirmed items.

**Params:**
- `items` (array of names or slugs)

**Returns:**
- `{ verified: [...], conflicts: [...] }` — conflicts name items not found in the pantry

---

## Grocery list tools

The grocery list (`grocery_list.toml`) is the SKU-free buy list for the next order. It accumulates intent across the week; resolution to a Kroger SKU and the cart write are deferred to order placement (`place_order`, Change 06b). See `docs/SCHEMAS.md` for the item schema.

### `read_grocery_list()`

Return the current buy list.

**Returns:**
- `{ items: [...] }`

### `add_to_grocery_list(item)`

Add an item (ingredient/product level, no SKU). Keyed by normalized `name` — re-adding an existing name **merges** (union `for_recipes`, reconcile `quantity`) rather than duplicating. New items start `status: "active"`.

**Params:**
- `name` (string, required)
- `quantity` (string, optional) — loose buy amount; defaults to `"1"`
- `kind` (optional): `grocery | household | other`
- `source` (optional): `ad_hoc | menu | pantry_low | stockup`
- `for_recipes` (array of slugs, optional)
- `note` (string or null, optional) — one-off brand request / occasion

**Returns:**
- `{ item, merged, commit_sha }`

### `update_grocery_list(name, ...patch)`

Patch an existing item by name (`quantity`, `kind`, `status`, `source`, `for_recipes`, `note`).

**Returns:**
- `{ item, commit_sha }` — `not_found` if no such item

### `remove_from_grocery_list(name)`

Remove an item by name.

**Returns:**
- `{ removed: bool, commit_sha? }`

**Notes:** Promoting a low/out pantry item onto the list is a **prompted** decision (record `source: "pantry_low"`), never automatic. The lifecycle past `active` (`in_cart` → `ordered` → `received`) is driven by `place_order` and the user-asserted transitions — see [`place_order`](#place_orderpayload) below.

---

## Kroger tools

### `kroger_flyer(filter)`

Synthesized sale scan — the public API has **no** flyer/circular endpoint, so this searches terms and keeps products where `promo > 0`, deduped by `productId`. Scans **precise** terms (caller-passed plus stockup/substitution candidates) and **broad** curated terms from `flyer_terms.toml`. Explicitly **non-exhaustive**: each term returns a relevance-ranked page (no sort-by-discount), so it samples the head of each category.

**Params:**
- `filter` (object, optional): `{ terms?, against_stockup?, against_substitutions? }`
  - `terms` (array of strings): precise context terms (current menu ingredients, etc.).
  - `against_stockup` (boolean): also scan `stockup.toml` item names.
  - `against_substitutions` (boolean): also scan `substitutions.toml` ingredients + their acceptable substitutes.

**Returns:**
- `{ items: [{ sku, brand, description, size, price: { regular, promo }, savings, categories, matched_term }] }`

**Notes:** Degrades gracefully when `flyer_terms.toml` is absent/empty — still scans the precise terms and returns a smaller list. Each term is paginated a couple of pages deep.

### `kroger_prices(ingredients)`

Get current prices for a specific list of ingredients (used for menu pre-pass). Takes the top relevant fulfillable product per term.

**Params:**
- `ingredients` (array of strings)

**Returns:**
- `{ prices: [{ ingredient, sku, brand, size, price: { regular, promo }, on_sale, available: { curbside, delivery } }] }`

**Notes:** `price` is `{ regular, promo }` (`promo: 0` = not on sale); `available` reflects curbside/delivery fulfillment at the preferred location — the public API exposes no live in-store stock. When no product matches a term, that entry is `{ ingredient, sku: null, available: { curbside: false, delivery: false } }`.

### `match_ingredient_to_kroger_sku(ingredient, context)`

Run the full 7-step matching pipeline. Returns a confident match, narrowed candidates for the LLM to choose from, or an `unavailable` signal. **Resolve-only** — it does not write the cache (that rides `place_order`, Change 06b) and it does not substitute (that's `propose_substitutions`).

**Params:**
- `ingredient` (string, required)
- `context` (object, optional): `{ recipe_slug, dietary, quantity_hint }`
- `bypass_cache` (boolean, optional): force re-resolution, skipping the cache hit — for when a cached SKU doesn't fit the recipe context (cached generic, recipe wants organic).

**Confidence rule:** confident when a cache hit OR a defined `preferences.toml [brands]` entry resolves it (including `[]` = "don't care, cheapest acceptable"); otherwise ambiguous. Cache hits are revalidated for current price + curbside/delivery availability before being returned.

**Identity relevance (near-hard).** Beyond curbside/delivery availability, a second near-hard constraint guards *which product*: each candidate is scored by how many query tokens appear in its description/categories, and a confident pick may only come from the **top relevance tier**. So `"anaheim peppers"` resolves to the Fresh Anaheim Peppers PLU, not a cheaper unrelated item that merely shows up in Kroger's results; and `[]` "don't care" picks the cheapest *matching* candidate, never the cheapest unrelated one. If nothing in the pool shares a query token, the tool returns `ambiguous` rather than confidently guessing. (Brand/dietary remain soft preferences — this constraint is about identity, not preference.)

**Returns (confident match):**
```
{
  resolved: true,
  sku: "0001111046025",
  brand: "Simple Truth Organic",
  size: "16.9 fl oz",
  price: { regular: 8.99, promo: 0 },
  on_sale: false,
  reason: "cache hit" | "preferred brand match" | "don't-care: cheapest acceptable" | etc.
}
```

**Returns (ambiguous):**
```
{
  resolved: false,
  ambiguous: true,
  candidates: [{ sku, brand, size, price: { regular, promo }, on_sale, unit_price?, fulfillment: { curbside, delivery } }],
  reason: "no brand preference defined; choose or say 'don't care'"
}
```

**Returns (unavailable):**
```
{
  resolved: false,
  reason: "unavailable",
  message: "No candidate is fulfillable via curbside/delivery at the preferred location."
}
```

**Notes:** When ambiguous, the LLM picks from conversational context or asks the user; a standing "don't care" answer is recorded as `[]` in `preferences.toml [brands]`. On `unavailable`, the LLM may call `propose_substitutions` (which surfaces alternatives for confirmation) — the matcher never substitutes itself. All resolutions feed back into the cache via the next batched commit.

### `compare_unit_price(items)`

Deterministic price-per-unit comparison, used by the matching tiebreaker and when presenting ambiguous candidates. **The LLM never does the arithmetic** — it forwards raw `price` + `size` strings; the tool parses, converts units, and ranks.

**Params:**
- `items` (array): `[{ id, price, size, quantity_override?, unit_override? }]` — `size` is the raw Kroger size string (`"1/2 gal"`, `"16.9 fl oz"`, `"6 ct"`). Pass `quantity_override`/`unit_override` only for residue the parser couldn't handle (see `incomparable`).

**Returns:**
- `{ ranked: [{ id, unit_price, base_unit }], cheapest, incomparable: [id] }`

**Notes:** Ranks only WITHIN a dimension (volume / weight / count) — never compares `$/fl oz` to `$/lb`. Cross-dimension or unparseable items land in `incomparable`; the LLM may normalize an unparseable size into `quantity_override`/`unit_override` and re-call. Same deterministic core the matcher uses internally for step-5 tiebreaking.

### `ready_to_eat_available()`

Cross-reference `ready_to_eat/*.toml` catalogs against current Kroger availability. "Available" means fulfillable via **curbside or delivery** at the preferred location (`fulfillment.curbside || fulfillment.delivery`) — the public Products API exposes no live in-store stock level.

**Returns:**
- `{ available: { breakfast: [...], lunch: [...], dinner: [...] }, unavailable: [...] }`

---

## Substitution tools

### `propose_substitutions(ingredient, mode)`

Apply `substitutions.toml` rules to surface acceptable alternatives.

**Params:**
- `ingredient` (string, required)
- `mode` (string, required): `"inventory"` (substitutes available in pantry) or `"sale"` (substitutes on sale at Kroger)

**Returns:**
- `{ substitutes: [...], unacceptable: [...] }`

**Notes:** Tool applies rules deterministically; LLM presents result to user for confirmation. `"sale"` mode fetches current Kroger flyer/price data **internally** (it does not require the caller to pre-pass `kroger_flyer`). Empty until `substitutions.toml` is seeded — the file is edit-when-directed user config.

---

## Sequencing tools

### `suggest_sequencing(seed_recipes)`

> **Status: built in Change 13**, not Change 08. The tool walks the component vocabulary, which is unseeded in the corpus today (≈1/63 recipes declare a component), so it ships with Change 13 (the change that seeds that vocabulary via corpus reconciliation). The menu-request flow tolerates an absent/empty sequencing result until then. Contract below is the target.

Walk `produces_components` / `uses_components` references to find recipe pairings.

**Params:**
- `seed_recipes` (array of slugs, required)

**Returns:**
- `{ suggestions: [{ recipe_to_add, reason, shared_component }] }`

**Notes:** Conservative — only returns strong matches. Empty array if nothing fits.

---

## Discovery tools

### `fetch_rss_discoveries()`

Fetch all feeds in `feeds.toml` and return a **deduped candidate pool** — deduped against recipes already in the corpus (by canonicalized `source:` URL) and with tracking query strings stripped. **No taste score and no ranking**: the agent judges taste fit against the taste profile and picks the 1–2 worth importing (then `import_recipe` + `create_recipe` each).

**Returns:**
- `{ candidates: [{ url, title, source, feed_weight, summary }], skipped?: [{ feed, reason }] }` — `source` is the feed name; `feed_weight` is the feed's configured trust hint (passed through, not used to rank); unreachable feeds are reported in `skipped`, not fatal.

**Notes:** Empty or absent `feeds.toml` returns `{ candidates: [] }`. There is no `fetch_flyer_featured` tool — Kroger exposes no "featured" primitive, so on-sale ready-to-eat discovery rides the existing `kroger_flyer` pre-pass (with ready-to-eat terms in `flyer_terms.toml`) plus agent-side dedup against `ready_to_eat/*.toml` and `add_draft_ready_to_eat`.

### `add_draft_ready_to_eat(items)`

Append new ready-to-eat items to the appropriate catalog in `draft` status.

**Params:**
- `items` (array): `[{ name, category, source, ... }]`

**Returns:**
- `{ added: [...] }`

### `update_ready_to_eat(slug, updates)`

Disposition or otherwise update a ready-to-eat item.

**Params:**
- `slug` (string, required) — or `name` if no slug yet
- `updates` (object): `{ status?, rating?, notes? }`

**Returns:**
- `{ updated_fields }`

---

## Preference / config tools (read-only by default)

### `read_preferences()`

Return parsed `preferences.toml`.

### `read_taste()`

Return contents of `taste.md`.

### `read_diet_principles()`

Return contents of `diet_principles.md`.

### `update_preferences(content)` / `update_taste(content)` / `update_diet_principles(content)` / `update_substitutions(content)` / `update_aliases(content)`

Write to user-curated files. **Content-faithful:** each writes exactly the full file content supplied by the caller — no inferred merge. **These should only be called when the user explicitly directs an edit.** The tools exist; the discipline of when to call them lives in AGENT_INSTRUCTIONS.md.

**Params:**
- `content` (string, required) — the complete new file text

**Returns:**
- `{ file, commit_sha }`

---

## Retrospective / analysis tools

### `retrospective(period)`

Aggregate **real** cooking history from `cooking_log.toml` over a period, joining `type=recipe` entries to the recipe index for protein/cuisine.

**Params:**
- `period` (string, optional, default `"month"`): `"Nd"` (e.g. `"30d"`) | `"week"` | `"month"` | `"quarter"` | `"year"` | `"all"`.

**Returns:**
```
{
  period, window: { from, to, days },
  recipes_cooked:   [{ recipe, count, dates }],   // distinct recipes, with per-cook dates
  protein_mix:      { <protein>: count },          // counts EVERY cook event; non-recipe entries via inline dims; missing → "unknown"
  cuisine_mix:      { <cuisine>: count },
  cadence:          { cooks, weeks, cooks_per_week },   // counts recipe + ad_hoc only (ready_to_eat is not cooking)
  cook_vs_convenience: { cooked, convenience },         // cooked = recipe + ad_hoc; convenience = ready_to_eat
  ready_to_eat_favorites: [{ name, count }],            // frequency-ranked; feeds menu-flow restock suggestions
  underused:        [{ slug, title, last_cooked }]      // active recipes not cooked within the window
}
```

**Notes:** `last_cooked` is derived (see `commit_changes`), so `underused` reflects real cook events. Eating out is never logged; leftovers of an already-logged cook are not re-logged.

### `read_meal_plan()`

Return the current meal plan — recipes committed to cook next (transient cook intent). Use at session start to resume.

**Params:** none.

**Returns:**
- `{ planned: [{ recipe, planned_for }] }` (`planned_for` may be null)

**Notes:** The session-start stale-planned reconcile surfaces only **due** rows (`planned_for` on/before today, or unset).

### `inventory_hypothetical(items)`

Speculative menu re-evaluation with hypothetical pantry additions.

**Params:**
- `items` (array): pantry items to add in-memory only

**Returns:**
- `{ would_improve_week: bool, suggested_changes: [...], notes: string }`

**Notes:** Does not persist anything. Used for "is this market haul worth grabbing?" reasoning.

---

## Commit / atomic operations

> **Re-cut (capture/flush split).** The original monolithic `write_cart_and_commit` is split into two tools that ship in different changes: **`commit_changes`** (repo commit, no cart — this change) and **`place_order`** (the order-time cart flush + SKU-cache write — Change 06b). The repo commit exists for memory's sake; the cart write is a separate, deferred, order-time operation. See `docs/notes/2026-06-09-order-flow-reframe.md`.

### `commit_changes(payload)`

Persist a batch of repo updates as **one** atomic git commit — no cart. The everyday persist path: use it at the end of a session to keep the git log clean instead of calling the granular write tools repeatedly. Every change is structurally validated before commit; the commit lands via the Git Data API (tree → commit → update ref) with optimistic ref-retry against the index-build Action.

**Params:**
```
{
  recipe_updates:       [{ slug, updates }],          // frontmatter merges (rating, status, ...; do NOT set last_cooked by hand)
  pantry_operations:    [{ op, item?, name? }],       // op: add | remove | verify
  pantry_verified:      [name, name, ...],            // reset last_verified_at
  ready_to_eat_drafts:  [{ meal, name, category?, source?, brand?, notes? }],
  ready_to_eat_updates: [{ name, updates }],          // matched by name across meal catalogs
  config_updates:       [{ file, content }],          // file: preferences|taste|diet_principles|substitutions|aliases
  cooking_log_entries:  [{ type, date?, recipe?, name?, protein?, cuisine? }],  // append cooked meals; date defaults to today
  meal_plan_ops:        [{ op, recipe, planned_for? }],   // op: add | remove  (committed cook intent)
  commit_message:       string
}
```
All sections are optional except `commit_message`.

**`cooking_log_entries` (cooking-history).** Appends to `cooking_log.toml`. `type` is `recipe | ready_to_eat | ad_hoc`; `recipe` is required for `type=recipe` (slug-only), `name` for the others. For each `type=recipe` entry, the recipe's `last_cooked` is **derived** (max log date for that slug) and co-written in the **same** commit — never set `last_cooked` via `recipe_updates`. Ready-to-eat consumption is a `{type:"ready_to_eat", name}` entry **plus** a `pantry_operations` `remove` when the user used the last of it (pantry is presence-based — there is no auto-decrement).

**`meal_plan_ops` (meal-planning).** Mutates `meal_plan.toml`. `add` upserts by recipe slug (updating `planned_for`); `remove` drops the slug's row. Menu agreement writes `add` rows; cook-capture / the stale-planned reconcile write `remove`.

**Returns:**
- `{ commit_sha, summary }`

**Notes:** Because the Worker is stateless, batching is **LLM-orchestrated** — accumulate a session's intended changes and flush them through one `commit_changes` call. The granular write tools (`update_recipe`, `update_pantry`, …) each commit on their own and are for standalone one-offs; don't call them N times mid-session.

### `place_order(payload)`

The order-time flush — the **only** tool that writes a Kroger cart. Resolves the whole to-buy set against *current* Kroger availability, writes the cart (`PUT /v1/cart/add`), and appends learned ingredient→SKU mappings to `skus/kroger.toml`. Backed by the Kroger `authorization_code` + PKCE user-context client and the KV-backed rotating refresh token.

**To-buy set (order-time dedup):** `grocery_list ∪ menu_needs − pantry_has`. Only `active` list items participate. A name present in the pantry is **not** silently dropped — it returns in `partials` for you to prompt on, and is bought only if the user confirms it via `include_partials` (the no-auto-decide rule). Default buy quantity is **1 package** per item unless overridden.

**Quantity (package count):** supply it per item via `menu_needs[].quantity`, or via the `quantities` map; the `quantities` map **overrides** `menu_needs[].quantity` when both are present (precedence: `quantities` → `menu_needs[].quantity` → default 1). A line that fell back to the default carries `assumed_quantity: true`. The tool reports that fact but does **not** classify "by-the-each produce" or do portion math — at `preview`, *you* reconcile any `assumed_quantity` by-the-each produce (peppers, tomatillos, …) against the recipe's required amount and set an explicit quantity before the real flush. (`grocery_list` items' string `quantity` like "2 lbs" is a human need-annotation, not a package count.)

**Resolution + checkpoint:** each item runs through the [matcher](#match_ingredient_to_kroger_skuingredient-context) with cache revalidation (a cache hit no longer fulfillable is re-resolved). Items the matcher returns as `ambiguous` or `unavailable` are collected into a single `checkpoint` and are **not** added to the cart. Disposition them and re-call with `overrides` (force a SKU) — already-carted items have advanced to `in_cart`, so they won't be re-added.

**Params:**
```
{
  menu_needs:       [{ name, quantity?, for_recipes? }],  // needs not yet on the list
  quantities:       { "<name>": <packages> },             // per-item package count (default 1)
  include_partials: ["<name>", ...],                       // pantry items the user confirmed buying anyway
  overrides:        [{ name, sku, brand?, size? }],        // disposition previously-ambiguous items
  preview:          bool                                    // resolve + report only; no cart write, no commits
}
```
All sections optional. With no args it flushes the current `grocery_list.toml`.

**Returns:**
```
{
  resolved:  [{ name, sku, brand, size, quantity, assumed_quantity }],  // assumed_quantity: qty defaulted to 1
  checkpoint:[{ name, kind: "ambiguous"|"unavailable", candidates?, message }],
  partials:  [{ name, for_recipes }],
  sku_cache: { committed, commit_sha?, error? },
  cart:      { written, count?, error?, code? },   // code carries reauth_required etc.
  list:      { advanced, commit_sha?, error? },
  preview:   bool
}
```

**Partial-failure honesty:** the SKU-cache commit and the cart write are **independent best-effort** operations (the SKU cache is a pure hint). Order: commit the cache → write the cart → advance the list to `in_cart` *only after a successful cart write*. So a cart failure leaves the list `active` (retryable, no silent drop) and **never** reports a populated cart; a cache-commit failure after a successful cart just re-resolves next time. If the cart write fails because the Kroger refresh token was rejected, `cart.code` is `reauth_required` — re-run the one-time `/oauth/init?tenant=<id>` (see `docs/SELF_HOSTING.md`).

**Lifecycle (`active → in_cart → ordered → received`):** `place_order` sets `in_cart`. Because the cart API is write-only and unreadable, the transitions past `in_cart` are **user-asserted**, never agent-verified:
- *"I placed the order"* → advance `in_cart` items to `ordered` via `update_grocery_list`.
- *"I picked up the groceries"* → `received` (terminal): `remove_from_grocery_list` for each, and for `grocery`-kind items only, restock `pantry.toml` via `update_pantry`. `household`/`other` items don't touch the pantry.

A **stale-cart reminder** fires when a new order begins while the prior list still has `in_cart` items never confirmed `ordered`: remind the user to clear the Kroger cart manually (the API can't), rather than silently double-adding.

---

## What this surface deliberately does NOT include

- No raw GitHub write access (atomic commits only)
- No raw Kroger API access (matching pipeline + cart write only)
- No "search arbitrary text across recipes" (use GitHub MCP for that)
- No "execute arbitrary code" or "run arbitrary script"
- No portion math (no whiteboard problem)
- No background or scheduled triggers
