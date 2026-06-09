// Worker environment. GITHUB_TOKEN is a secret (wrangler secret put); the rest
// are non-secret vars from wrangler.jsonc. The repo is public, so its
// coordinates are not sensitive.

export interface Env {
  /** Fine-grained PAT scoped to the repo (contents:read+write). Secret. */
  GITHUB_TOKEN: string;
  /** Repo owner, e.g. "caseyWebb". */
  GITHUB_OWNER: string;
  /** Repo name, e.g. "groceries". */
  GITHUB_REPO: string;
  /** Ref to read at, e.g. "main". */
  GITHUB_REF: string;
}
