# grocery-agent

A personal grocery agent. It plans meals, tracks pantry inventory, and populates
a Kroger cart through conversation — you talk to it like a knowledgeable friend
who knows your kitchen, not a service you issue commands to.

## How it works

Three components, glued together:

- **Claude.ai** (web + mobile) — the conversational surface and reasoning. Each
  conversation starts fresh; system state lives in this repo, not in chat history.
- **Cloudflare Worker** (`worker/`) — a custom MCP server exposing coarse,
  opinionated domain tools (Kroger product matching, pantry verification,
  substitution rules, atomic commits). The deterministic logic lives here.
- **This GitHub repo** — the data substrate. Recipes, pantry, preferences, and
  caches are flat files (TOML + markdown); git history is the audit log.

The agent reads your message, reasons about intent, calls Worker tools in sensible
order, and synthesizes the results into a conversational reply. The genuinely fuzzy
work (understanding requests, proposing menus) is the LLM's; everything
deterministic (matching, filtering, file I/O, commits) is the Worker's.

## Repository layout

| Path | What it holds |
| --- | --- |
| `CLAUDE.md` | Canonical agent instructions (consumed by Claude Code / Claude.ai project instructions). |
| `ROADMAP.md` | The sequence of OpenSpec changes that build this system. |
| `recipes/` | Recipe markdown files with YAML frontmatter. |
| `ready_to_eat/` | Ready-to-eat catalogs (`breakfast`/`lunch`/`dinner`). |
| `pantry.toml` | Live inventory (agent-writable). |
| `preferences.toml`, `substitutions.toml`, `aliases.toml`, `feeds.toml`, `stockup.toml` | User-curated config. |
| `ingredients.toml` | Reserved for Phase 7 (perishability data); empty in v1. |
| `taste.md`, `diet_principles.md` | User-curated narrative profiles. |
| `skus/kroger.toml` | Machine-maintained Kroger SKU cache. |
| `_indexes/` | Generated index JSON (built by a GitHub Action). |
| `worker/` | Cloudflare Worker (MCP server) source. |
| `scripts/` | Build/validation scripts. |
| `docs/` | Reference docs: [PROJECT.md](docs/PROJECT.md), [SCHEMAS.md](docs/SCHEMAS.md), [TOOLS.md](docs/TOOLS.md). |

## Where to start

- **What this is and why** → [docs/PROJECT.md](docs/PROJECT.md) (full proposal, architecture, phased roadmap).
- **Data file schemas** → [docs/SCHEMAS.md](docs/SCHEMAS.md).
- **MCP tool inventory** → [docs/TOOLS.md](docs/TOOLS.md).
- **Agent behavior rules** → [CLAUDE.md](CLAUDE.md).
- **Build sequence** → [ROADMAP.md](ROADMAP.md).

## Using the repo

Recipes and data are plain files — browse them in any editor, or point Obsidian at
a local clone for mobile recipe viewing while cooking. Edits to user-curated files
(`taste.md`, `preferences.toml`, etc.) are yours to make; the agent only touches
them when explicitly directed. Everything else evolves as a side effect of normal
conversational flow.
