# grocery-mcp Worker

Cloudflare Worker hosting the grocery agent's custom MCP server. This change
(Change 04) implements the **read-only, repo-data-backed** tools. Kroger tools
(Change 05) and write tools (Change 06) build on this skeleton.

## Tools

All six read only the GitHub repo and return structured JSON:

| Tool | Reads | Notes |
|------|-------|-------|
| `list_recipes(filters)` | `_indexes/recipes.json` | AND on array filters; `status` defaults to `active`, `"all"` opts out; `exclude_cooked_within_days` is a param |
| `read_recipe(slug)` | `recipes/<slug>.md` | returns `{ slug, frontmatter, body }` |
| `read_pantry(filter)` | `pantry.toml` | `category` + `prepared_only`; `stale_only` is `unsupported` until `ingredients.toml` (Change 12) |
| `read_preferences()` | `preferences.toml` | parsed |
| `read_taste()` | `taste.md` | raw markdown |
| `read_diet_principles()` | `diet_principles.md` | raw markdown |

Failures return a structured `{ error, message, ... }` (codes: `not_found`,
`index_unavailable`, `upstream_unavailable`, `malformed_data`, `unsupported`) —
never a raw throw.

## Architecture

- **Transport:** `createMcpHandler` (from `agents/mcp`) over Streamable HTTP —
  stateless, no Durable Objects, no KV. MCP endpoint is `POST /mcp`; `GET /`
  returns a health line.
- **Data access:** one authenticated GitHub client (`src/github.ts`) reads files
  at `GITHUB_REF` via the Contents API (raw media type), with retry/backoff.
- **Parsing:** `js-yaml` + a manual frontmatter split, `smol-toml` for TOML
  (`src/parse.ts`). No `gray-matter`. The `nodejs_compat` flag is enabled because
  the `agents` SDK needs it — our parsing code does not.

## Configuration

Non-secret repo coordinates are `vars` in `wrangler.jsonc`
(`GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_REF`). The only secret is:

- **`GITHUB_TOKEN`** — a fine-grained PAT scoped to the repo
  (`contents:read+write`; write scope reserved for Change 06).

Secrets are **never** committed. Set once via `wrangler secret put`; they persist
across deploys.

## Local development

```sh
npm install

# Provide the PAT for local runs. .dev.vars is gitignored — never commit it.
echo 'GITHUB_TOKEN = "github_pat_..."' > .dev.vars

npm run dev          # wrangler dev (local Worker)
npm run typecheck    # tsc --noEmit
npm test             # vitest (pure logic: filtering, parsing, errors)
```

Point the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) at
the local URL's `/mcp` endpoint and call `list_recipes({ status: "active" })`.

> Gitignored-but-needed-to-run: **`.dev.vars`** (local secrets). Add any future
> local-only files to this list as they're introduced.

## First deploy (one-time, manual)

Requires a Cloudflare account and a `workers.dev` subdomain.

```sh
npx wrangler deploy                 # creates the Worker
npx wrangler secret put GITHUB_TOKEN  # paste the PAT
```

After this, **CD owns every deploy**: a push to `worker/**` on `main` runs
[`.github/workflows/deploy-worker.yml`](../.github/workflows/deploy-worker.yml),
which typechecks, tests, and deploys using the `CLOUDFLARE_API_TOKEN` Actions
secret. The Worker's own secrets are not touched by CD — they persist.

## Observability

`observability.enabled` is on in `wrangler.jsonc`. Tail live logs with:

```sh
npx wrangler tail
```
