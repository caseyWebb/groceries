# Diet principles

> User-curated rules with reasoning. The agent edits this file ONLY when
> explicitly directed. Menu generation honors these principles **softly** —
> biasing toward them and explaining the tradeoff when it can't satisfy all,
> grounded in real history from `retrospective` (not just intent). See
> docs/SCHEMAS.md.
>
> **This is an agent-drafted starter — edit it to match how you actually want to
> eat.** Targets are phrased in the controlled `protein` / `cuisine` vocabulary
> so the agent can check them against `retrospective`.

## Variety targets

_(Soft goals — the agent favors satisfying these and flags when it can't.)_

- **`fish` at least once a week.** Lighter protein in the rotation.
- **At least one `vegetarian` (or `vegan`) dinner a week.**
- **Don't repeat the same `protein` bucket more than twice in a week** — vary across `chicken` / `beef` / `pork` / `fish` / `vegetarian`.
- **No single `cuisine` more than twice in a week** — keep the week from collapsing into all-`italian` or all-`american`.
- **Favor underused recipes over re-cooking recent ones** — when two options fit, prefer the one not cooked lately (the agent has this from `retrospective`'s `underused`).

## Restrictions

_(Hard exclusions — the agent treats these as gates and never proposes a recipe that violates one. None declared yet — add yours.)_

-

## Reasoning

These exist to keep the week varied, prevent waste, and avoid protein/cuisine ruts — not to be rigid. They are **soft**: a comfort-food week or a craving overrides them, and the agent should say "this leans heavy on `beef` and skips `fish` this week — want me to swap one?" rather than silently enforcing or silently ignoring. Hard restrictions (allergies, things I never want) are the only non-negotiable lines; everything under Variety targets is a nudge.
