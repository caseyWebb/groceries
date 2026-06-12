## Context

This change removes a dead capability, but its real significance is as the **first application of a restated determinism boundary** for the project. The original boundary was drawn to optimize tokens and to keep a provably-correct deterministic core. Real use revealed the premise was wrong: the curated tables (`substitutions.toml`, and — see the follow-ups — `aliases.toml`) assume spotless, enumerable data that members never actually maintain, and the determinism they bought was mostly illusory because the *decisions* always routed through the LLM + a human confirmation anyway.

This doc records the boundary principle, then the staged roadmap that shifts the project's weight toward LLM reasoning without big-banging it.

## Goals / Non-Goals

**Goals:**
- Remove `ingredient-substitution` cleanly, rehoming its irreducible bits (vetoes, ranked preferences) to `taste.md`.
- Move inventory-substitution spotting to LLM reasoning over a pantry loaded up front as a *selection* input.
- State a durable determinism-boundary principle and a staged follow-up roadmap, so this isn't a one-off deletion but the first move in a deliberate shift.

**Non-Goals:**
- **Not** touching the Kroger matching pipeline in this change. The `aliases` refactor (D3 below) is a *separate, later* proposal.
- **Not** dissolving `verify` in this change — only dropping its substitution bucket. Its shrinkage is a downstream consequence, not this scope.
- **Not** building an eval harness here. The testability shift (see Risks) is acknowledged, not solved, by this change.

## Decisions

### D1 — The restated boundary: guard keys and gates, not decisions

The determinism boundary is **not** "expensive LLM vs cheap table." It is **state coherence**. Sort every mechanism into one of two kinds:

- **Decisions** — "is trout an acceptable stand-in for salmon?", "is EVOO what this recipe calls for?", "which brand preference applies here?". One-shot, consumed once, confirmed by a human in the loop. → **LLM reasoning over loaded context.** World knowledge plus the actual data in context beats a curated table, and handles the messy long tail tables can't enumerate.
- **Keys & gates** — stable identifiers into persistent/shared state (slugs, the SKU-cache key), validators that reject malformed writes, and search/filter over data too large to load (the Kroger catalog, the recipe corpus index). A wrong answer here is silent corruption or a poisoned shared cache, not a recoverable one-shot miss. → **Keep deterministic.**

The load-bearing refinement: **most "keys" only need determinism because we assumed a blind lookup into unloaded data. If the keyed store is small enough to load into context, the LLM reasons over it by meaning and the stable key stops being necessary.** Per-tenant, per-session state (pantry, brands, grocery list, taste, the chosen recipe set) is nearly all loadable — so the deterministic-key requirement melts there. What does *not* melt: the Kroger catalog (millions of SKUs, unloadable, touches money), the shared SKU cache (large, cross-tenant — though a miss degrades gracefully to a re-search), the corpus index (`list_recipes` stays a membership *filter* that fetches, not decides), and generated IDs/slugs (stable by construction, referenced not re-derived). Schema validators are *gates* — keep every one.

A second axis governs how aggressive to be: **lean in hardest on per-tenant, per-session state; be most conservative on shared, persistent state**, where one tenant's LLM-driven inconsistency has blast radius for everyone.

The safety net that makes the whole shift viable is already built: **the agent proposes, the user confirms; nothing auto-applies.** Human-in-the-loop confirmation is what stops an LLM normalization slip from becoming silent state corruption. Projects without that posture can't safely make this move; this one can.

### D2 — Substitutions is a pure "decision," so it moves to the LLM

Applying D1: substitution candidate-enumeration is a decision (consumed once, user-confirmed), and the data it reasons over is loadable.

- **Inventory subs** reason over the **pantry** — small, loadable. So load it up front (it also improves selection: "you've got salmon and bok choy — lean into these") and let the LLM spot stand-ins. With the pantry in context and the chosen recipes loaded via `read_recipe`, the `verify` tool's whole job (parse → normalize → match → age math → to-buy) becomes LLM reasoning, so `verify` is **retired outright** (not just stripped of its sub bucket) — semantic matching like `scallion`/`green onion` actually improves, and the orphaned recipe-ingredient parser goes with it. The one trade is `verify`'s exhaustive bucketing guarantee, low-stakes against the iterate-before-commit confirmation.
- **Sale subs / unavailable fallback** reason over the **Kroger catalog** — unloadable, so they stay enumerate-then-search; the only change is the candidate list comes from world knowledge instead of `substitutions.toml`.
- **Vetoes / ranked preferences** are personal, not world knowledge → captured as `taste.md` prose the LLM honors at proposal time.

**Why pantry-before-selection (the unbundling).** `verify` today does two welded jobs: (1) it is how the pantry *enters* LLM context, and (2) it produces the structured *digest*. Loading `read_pantry` up front takes over job 1 and promotes the pantry from a post-selection filter to a selection input; `verify` keeps job 2 but runs *downstream* of selection on the narrowed set. This also fixes a latent muddiness where open-ended candidates were verified before taste/diet/pantry were even loaded.

**Why not mirror the Kroger enumerate-then-search pattern against the pantry?** Because the pantry is loadable and Kroger is not. Mirroring it would mean building a pantry-query tool or doing N round-trips to avoid loading a list smaller than the reasoning context itself — cargo-culting a pattern whose justification (unloadable catalog) doesn't apply.

### D3 — This change is Phase 0 of the determinism-boundary shift

The weight shift this change begins is captured project-wide in **[ADR 0001 — Determinism boundary: capture → retrieve → narrow](../../../docs/adr/0001-determinism-boundary-capture-retrieve-narrow.md)**, which holds the authoritative boundary statement, the locked decisions, the deferred ingredient-graph alternative, and the rollout. This change is **Phase 0**: remove the dead substitution mechanism, retire `verify_pantry`, and load the pantry up front as a selection input — all strict simplification. **Phase 1** is recipe faceting (a `course` field so `meal-plan` fetches the relevant active slice). Ship Phase 0, validate on real menus (does pantry-up-front produce better menus? does the LLM reliably catch trout/salmon stand-ins without duplicate buys?), then proceed.

**Supersession.** Earlier drafts of this roadmap proposed (a) "aliases → pure read-time reasoning + a matcher refactor" and (b) an ingredient-identity registry / knowledge graph as Phase 1. Both are **superseded** by the ADR: ingredients stay strings, `aliases.toml` stays as the matcher's small normalization table, and the near-term lever is recipe-side faceting, not ingredient infrastructure (the graph is deferred behind a concrete trigger). `verify_pantry` is retired *in this change*, with its sole-consumer recipe-ingredient parser.

**The structural consequence to internalize:** this shift relocates the project's center of gravity from `src/` (deterministic tools) to `AGENT_INSTRUCTIONS.md` (the skills/persona that now carry the reasoning load). Tools shrink to fetchers + gates + ID-generation + the matcher core; the prompt becomes the most load-bearing, most carefully-reviewed artifact. A corollary correction: a *tool* cannot "pull the pantry if it isn't loaded" — tools are stateless and can't see context. Ensuring the pantry is loaded is a **skill-orchestration** concern (the flow calls `read_pantry`), which is exactly the tools→skills migration in miniature.

### D4 — Model tier is the real lever on the shift's cost

The shift trades keyed-lookup efficiency for load-and-reason context, which costs **latency** more than dollars in a conversational UX. Observed: it's snappy today — but that's on Opus/Sonnet, and the per-turn reasoning here (reason over a loaded pantry + corpus index + brands + list) is **plausibly within Haiku's range**. If so, Haiku resolves token cost *and* speed better than any architectural micro-optimization could, making "dumb-but-better" load-and-reason cheap enough to be the default. This is **untested** and a deliberate non-goal of this change — but it is the dominant cost lever and the reason not to over-engineer token-savings back in. Treat it as the first thing to A/B once the beachhead ships: run `meal-plan` on Haiku against the loaded-context flow and measure menu quality + latency.

## Risks / Trade-offs

- **Testability regression.** The deleted logic (`substitutions.ts`, and later the matcher's normalization) is cheaply unit-tested; LLM reasoning is not. Confidence moves to prompt quality + evals — a heavier lift that may not get built, turning *proven* logic into *untested-in-practice* logic. Acknowledged, not solved here; the eval harness is a prerequisite the `aliases` follow-on should weigh before touching the matcher.
- **Intermittent state-coherence bugs.** Duplicate grocery-list rows, a brand pref that occasionally doesn't apply, a thrashing SKU cache — harder to debug because data-dependent and non-reproducible. Mitigation: keep determinism at the genuine keys/IDs/validators (D1), load-and-reason for small per-tenant state, and rely on confirm-first UX as the guard.
- **Conditional on tables staying sparse.** The whole case rests on "members don't curate these." If some member *does* lovingly curate aliases, an LLM ignoring it is worse — hence the D3 escape hatch (keep the file as advisory loaded context, not authoritative).
- **Latency on large inputs.** A few-hundred-recipe corpus index + large pantry loaded every menu turn is bounded but not free; load the index (lean entries), not full recipe bodies. See D4 — model tier dominates this.

## Migration

No data migration. `substitutions.toml` (shared and any per-tenant) and the data-template stub are deleted; the files are uncurated, so there is nothing to preserve. A member who had voiced substitution stances can have them re-captured as `taste.md` prose through normal use. The per-tenant override layer (`mergeSubstitutionRules`) is removed outright — substitutions was its only consumer.
