// Authenticated GitHub data-access client (design D2). The single read path for
// all repo data; reused by later changes. Reads files at GITHUB_REF via the
// Contents API with the raw media type (avoids base64 round-trips). Retries
// transient failures and rate limits with backoff, and surfaces exhaustion as a
// typed error the tool boundary maps to a structured result.

import type { Env } from "./env.js";

/** Thrown by the client; callers map `status` to a structured error code. */
export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

const MAX_ATTEMPTS = 3;
const USER_AGENT = "grocery-mcp";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry on 5xx, 429, and rate-limited 403; otherwise fail fast. */
function isTransient(status: number, remaining: string | null): boolean {
  if (status >= 500) return true;
  if (status === 429) return true;
  if (status === 403 && remaining === "0") return true;
  return false;
}

export interface GitHubClient {
  /** Fetch a repo file's raw text. Throws GitHubError(404) when absent. */
  getFile(path: string): Promise<string>;
}

export function createGitHubClient(env: Env): GitHubClient {
  const base = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents`;

  async function getFile(path: string): Promise<string> {
    const url = `${base}/${path}?ref=${encodeURIComponent(env.GITHUB_REF)}`;
    let lastStatus = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github.raw",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": USER_AGENT,
        },
      });

      if (res.ok) return res.text();

      lastStatus = res.status;
      if (res.status === 404) {
        throw new GitHubError(404, `Not found: ${path}`);
      }

      const remaining = res.headers.get("x-ratelimit-remaining");
      if (isTransient(res.status, remaining) && attempt < MAX_ATTEMPTS) {
        await sleep(200 * attempt);
        continue;
      }
      throw new GitHubError(res.status, `GitHub request failed (${res.status}) for ${path}`);
    }

    throw new GitHubError(lastStatus, `GitHub request exhausted retries for ${path}`);
  }

  return { getFile };
}
