# Data-repo caller workflows

Reference copies of the thin workflows that live in **your private data repo** at
`.github/workflows/`. They're tiny callers of the *reusable* workflows in this
(public) code repo — the code repo holds the logic and no secrets; your private
data repo holds your config + the single `CLOUDFLARE_API_TOKEN` secret and is your
control plane. Running them there (not in a fork of the public repo) is what keeps
invite codes out of public logs.

| Caller (in your data repo) | Calls (here) | Does |
|---|---|---|
| `deploy.yml` | `data-deploy.yml` | deploy the Worker (overlays your `wrangler.jsonc`) |
| `onboard.yml` | `data-onboard.yml` | mint a member's invite code + allowlist entry |
| `revoke.yml` | `data-revoke.yml` | remove a member's allowlist entry + invite code |
| `build-indexes.yml` | `data-build-indexes.yml` | rebuild `_indexes/` from `recipes/` |
| `build-site.yml` | `data-build-site.yml` | build + deploy the optional cookbook site |

The `build-*` callers ship in the [`groceries-agent-data-template`](https://github.com/caseyWebb/groceries-agent-data-template);
copy `deploy.yml` / `onboard.yml` / `revoke.yml` from this directory if your data
repo predates them. See [`../SELF_HOSTING.md`](../SELF_HOSTING.md) for the secret +
variables (`CLOUDFLARE_API_TOKEN`, `TENANT_KV_ID`, `WORKER_NAME`/`WORKER_HOST`) each needs.
