// Per-tenant initialization status for the grocery profile. Backs the `profile_status`
// read tool and the `grocery-core` onboarding gate: answers "is this member set up?"
// from a SINGLE listing of the caller's `users/<username>/` subtree (via the prefixed
// GitHub client), not a fan of per-area reads. Factored out so the derivation is
// unit-testable against a fake GitHubClient (mirrors storage-guidance.ts).

import { GitHubError, type DirEntry, type GitHubClient } from "./github.js";
import { ToolError } from "./errors.js";

/**
 * The onboarding areas, each keyed to the file whose presence marks it done; this is
 * also the surfaced order of `missing`. `store` (`preferences.toml`) is the
 * unconditional first onboarding area, so its presence is the initialization predicate.
 */
const AREA_FILES: ReadonlyArray<readonly [area: string, file: string]> = [
  ["store", "preferences.toml"],
  ["taste", "taste.md"],
  ["diet", "diet_principles.md"],
  ["equipment", "kitchen.toml"],
  ["pantry", "pantry.toml"],
  ["ready-to-eat", "ready_to_eat.toml"],
  ["stockup", "stockup.toml"],
  ["corpus", "overlay.toml"],
];

export interface ProfileStatus {
  initialized: boolean;
  missing: string[];
}

/**
 * Derive `{ initialized, missing }` from the caller's subtree listing. `entries` is
 * the file/dir listing of `users/<username>/`, or `null` when the subtree does not
 * exist yet (a 404 — a brand-new member). `initialized` is true once `preferences.toml`
 * is present (as a file); `missing` lists the area keys whose file is absent.
 */
export function deriveProfileStatus(entries: DirEntry[] | null): ProfileStatus {
  const present = new Set(
    (entries ?? []).filter((e) => e.type === "file").map((e) => e.name),
  );
  const missing = AREA_FILES.filter(([, file]) => !present.has(file)).map(([area]) => area);
  return { initialized: present.has("preferences.toml"), missing };
}

/**
 * Read the caller's initialization status in one Contents-API call (the prefixed
 * client lists `users/<username>/`). A 404 on the subtree (brand-new member) is not
 * an error — it derives to "not initialized, all areas missing." Any other upstream
 * failure surfaces as a structured `upstream_unavailable`, so the gate can treat an
 * indeterminate result as non-gating (fail open).
 */
export async function profileStatus(gh: GitHubClient): Promise<ProfileStatus> {
  try {
    return deriveProfileStatus(await gh.listDir(""));
  } catch (e) {
    if (e instanceof GitHubError) {
      if (e.status === 404) return deriveProfileStatus(null);
      throw new ToolError("upstream_unavailable", e.message);
    }
    throw e;
  }
}
