import { describe, it, expect } from "vitest";
import { filterRecipes, type RecipeIndex } from "../src/recipes.js";

const index: RecipeIndex = {
  active1: {
    slug: "active1",
    title: "Active One",
    status: "active",
    protein: "beef",
    cuisine: "american",
    tags: ["weeknight", "beef", "one-pot"],
    season: ["fall"],
    dietary: ["dairy-free"],
    time_total: 40,
    last_cooked: null,
  },
  active2: {
    slug: "active2",
    title: "Active Two",
    status: "active",
    protein: "chicken",
    cuisine: "italian",
    tags: ["weeknight"],
    season: [],
    dietary: [],
    time_total: 90,
    last_cooked: "2026-06-05", // 3 days before the fixed now
  },
  draft1: {
    slug: "draft1",
    title: "Draft One",
    status: "draft",
    protein: "beef",
    tags: ["beef"],
    time_total: 20,
    last_cooked: "2025-01-01",
  },
};

const NOW = new Date("2026-06-08T00:00:00Z");

describe("filterRecipes", () => {
  it("defaults to active status", () => {
    const out = filterRecipes(index, {}, NOW).map((r) => r.slug);
    expect(out.sort()).toEqual(["active1", "active2"]);
  });

  it("status 'all' returns every status", () => {
    const out = filterRecipes(index, { status: "all" }, NOW).map((r) => r.slug);
    expect(out.sort()).toEqual(["active1", "active2", "draft1"]);
  });

  it("selects an explicit non-active status", () => {
    const out = filterRecipes(index, { status: "draft" }, NOW).map((r) => r.slug);
    expect(out).toEqual(["draft1"]);
  });

  it("array filters match ALL listed values (AND)", () => {
    expect(filterRecipes(index, { tags: ["weeknight", "beef"] }, NOW).map((r) => r.slug)).toEqual([
      "active1",
    ]);
    expect(filterRecipes(index, { tags: ["weeknight"] }, NOW).map((r) => r.slug).sort()).toEqual([
      "active1",
      "active2",
    ]);
  });

  it("filters by scalar fields and max_time_total", () => {
    expect(filterRecipes(index, { cuisine: "italian" }, NOW).map((r) => r.slug)).toEqual([
      "active2",
    ]);
    expect(filterRecipes(index, { max_time_total: 50 }, NOW).map((r) => r.slug)).toEqual([
      "active1",
    ]);
  });

  it("not_cooked_since admits never-cooked recipes (null last_cooked)", () => {
    const out = filterRecipes(index, { not_cooked_since: "2026-01-01" }, NOW).map((r) => r.slug);
    // active1 (null) passes; active2 cooked 2026-06-05 (>= date) is excluded.
    expect(out).toEqual(["active1"]);
  });

  it("exclude_cooked_within_days drops recently cooked, keeps never-cooked", () => {
    const out = filterRecipes(
      index,
      { status: "all", exclude_cooked_within_days: 14 },
      NOW,
    ).map((r) => r.slug);
    // active2 cooked 3 days ago -> excluded. active1 (null) and draft1 (2025) kept.
    expect(out.sort()).toEqual(["active1", "draft1"]);
  });

  it("returns slug, title, and frontmatter for matches", () => {
    const [item] = filterRecipes(index, { status: "draft" }, NOW);
    expect(item.slug).toBe("draft1");
    expect(item.title).toBe("Draft One");
    expect(item.frontmatter.protein).toBe("beef");
  });
});
