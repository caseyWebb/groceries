import { describe, it, expect } from "vitest";
import { deriveProfileStatus, profileStatus } from "../src/profile-status.js";
import { GitHubError, type GitHubClient, type DirEntry } from "../src/github.js";
import { ToolError } from "../src/errors.js";

const ALL_AREAS = ["store", "taste", "diet", "equipment", "pantry", "ready-to-eat", "stockup", "corpus"];
const file = (name: string): DirEntry => ({ name, type: "file" });

describe("deriveProfileStatus", () => {
  it("all area files present → initialized, nothing missing", () => {
    const entries = [
      "preferences.toml",
      "taste.md",
      "diet_principles.md",
      "kitchen.toml",
      "pantry.toml",
      "ready_to_eat.toml",
      "stockup.toml",
      "overlay.toml",
    ].map(file);
    expect(deriveProfileStatus(entries)).toEqual({ initialized: true, missing: [] });
  });

  it("preferences.toml only → initialized, remaining areas missing in order", () => {
    expect(deriveProfileStatus([file("preferences.toml")])).toEqual({
      initialized: true,
      missing: ["taste", "diet", "equipment", "pantry", "ready-to-eat", "stockup", "corpus"],
    });
  });

  it("null subtree (404) → not initialized, all areas missing", () => {
    expect(deriveProfileStatus(null)).toEqual({ initialized: false, missing: ALL_AREAS });
  });

  it("files present but no preferences.toml → not initialized, store still missing", () => {
    const res = deriveProfileStatus([file("taste.md"), file("pantry.toml")]);
    expect(res.initialized).toBe(false);
    expect(res.missing).toContain("store");
    expect(res.missing).not.toContain("taste");
  });

  it("a preferences.toml DIR (not a file) does not count as initialized", () => {
    expect(deriveProfileStatus([{ name: "preferences.toml", type: "dir" }]).initialized).toBe(false);
  });
});

describe("profileStatus", () => {
  function fakeGh(dir: DirEntry[] | GitHubError): GitHubClient {
    const notUsed = () => {
      throw new Error("not used");
    };
    return {
      async getFile() {
        throw new Error("not used");
      },
      async listDir() {
        if (dir instanceof GitHubError) throw dir;
        return dir;
      },
      getRef: notUsed,
      getCommitTree: notUsed,
      createTree: notUsed,
      createCommit: notUsed,
      updateRef: notUsed,
      createIssue: notUsed,
      getPagesUrl: notUsed,
    };
  }

  it("derives status from the subtree listing", async () => {
    const res = await profileStatus(fakeGh([file("preferences.toml"), file("overlay.toml")]));
    expect(res.initialized).toBe(true);
    expect(res.missing).not.toContain("store");
    expect(res.missing).not.toContain("corpus");
  });

  it("treats a 404 subtree as a brand-new member", async () => {
    const res = await profileStatus(fakeGh(new GitHubError(404, "Not found")));
    expect(res).toEqual({ initialized: false, missing: ALL_AREAS });
  });

  it("maps a non-404 upstream failure to a structured upstream_unavailable", async () => {
    const err = await profileStatus(fakeGh(new GitHubError(500, "boom"))).catch((e) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err.code).toBe("upstream_unavailable");
  });
});
