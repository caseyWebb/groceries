# grocery-agent

A personal grocery agent. It plans meals, tracks pantry inventory, and populates a
Kroger cart through conversation — you talk to it like a knowledgeable friend who
knows your kitchen, not a service you issue commands to. It runs inside **Claude.ai**
(web + mobile) and is self-hostable for a small friend group.

> **Status:** working end-to-end and in personal use — a release candidate, not a
> packaged product. It's a single-maintainer project; self-hosting works but assumes
> you're comfortable with Cloudflare, GitHub Actions, and a Kroger Developer account.

This repository is the **code**: the `grocery-mcp` MCP server and the agent's
persona ([`AGENT_INSTRUCTIONS.md`](AGENT_INSTRUCTIONS.md)). The **data** — recipes,
pantry, preferences — lives in a separate private **data repo** per deployment.

## How it works

Three components:

- **Claude.ai** — the conversational surface and reasoning. Each chat starts fresh;
  state lives in the data repo, not in chat history.
- **The Worker** (this repo, root `src/`) — a Cloudflare Worker hosting the MCP
  server: opinionated domain tools (Kroger matching, pantry verification,
  substitutions, atomic commits) plus an **OAuth 2.1 provider** that members connect
  their Claude.ai to via an operator-issued invite code. The deterministic logic.
- **The data repo** (`<you>/groceries-agent-data`, private) — shared `recipes/` +
  reference data at the root, and one `users/<username>/` subtree per member
  (pantry, preferences, ratings, notes). Git history is the audit log.

The fuzzy work (understanding requests, proposing menus) is the LLM's; everything
deterministic (matching, filtering, file I/O, commits) is the Worker's.

## This repo

| Path | What it holds |
| --- | --- |
| `src/`, `test/`, `wrangler.jsonc` | the Cloudflare Worker (MCP server + OAuth provider) |
| `scripts/` | index + static-site build tooling, run by data repos via reusable CI |
| `.github/workflows/` | `ci` (typecheck + tests) + reusable `data-*` workflows operators call |
| `AGENT_INSTRUCTIONS.md` | the agent persona; source for the `plugin/` bundle installed in Claude.ai |
| `docs/` | [PROJECT](docs/PROJECT.md) (architecture), [SCHEMAS](docs/SCHEMAS.md), [TOOLS](docs/TOOLS.md), [SELF_HOSTING](docs/SELF_HOSTING.md) |
| `openspec/` | the change/spec history — how the system was built, and the contract for changes |
| `CLAUDE.md` | development guide for working in this repo |

The data repo is created from the [`groceries-agent-data-template`](https://github.com/caseyWebb/groceries-agent-data-template), which is also vendored here as a submodule at `docs/data-template/` for reference.

## Self-hosting

Self-host for yourself or a friend group **without forking this repo and without
running anything locally** — your private **data repo is the control plane**, and it
drives everything from GitHub Actions:

1. **Create a data repo** from the template (private); add your `wrangler.jsonc` vars
   and the one `CLOUDFLARE_API_TOKEN` Actions secret. It carries thin caller
   workflows that `uses:` the reusable workflows here — no fork to maintain.
2. **Register** a GitHub App (data-repo access) and a Kroger Developer app.
3. **Deploy** the Worker via the data repo's *Deploy Worker* Action.
4. **Onboard** yourself and friends with the *Onboard member* Action — it mints an
   invite code; their `users/<username>/` subtree is created on first use.

Full step-by-step: **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## Developing

The Worker is the root package (one `package.json` for the Worker + `scripts/`):

```sh
mise install         # Node 22 (pinned in mise.toml)
git submodule update --init   # populate docs/data-template/ (reference only; --remote to bump)
npm install
npm run typecheck    # tsc --noEmit
npm test             # vitest — Worker tests (test/*.test.ts)
npm run test:tooling # node --test — build tooling tests (tests/*.test.mjs)
npm run dev          # wrangler dev — local Worker for MCP Inspector
```

See [CLAUDE.md](CLAUDE.md) for conventions and the OpenSpec change workflow.
