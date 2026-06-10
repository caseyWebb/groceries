import { describe, it, expect } from "vitest";
import {
  entriesOf,
  validateNewEntry,
  appendEntries,
  deriveLastCooked,
  type CookingLogEntry,
} from "../src/cooking-log.js";

describe("entriesOf", () => {
  it("coerces parsed entries and drops unknown fields", () => {
    const parsed = {
      entries: [
        { date: "2026-06-09", type: "recipe", recipe: "arroz-caldo", junk: 1 },
        { date: "2026-06-08", type: "ready_to_eat", name: "frozen lasagna" },
      ],
    };
    const entries = entriesOf(parsed);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ date: "2026-06-09", type: "recipe", recipe: "arroz-caldo" });
    expect(entries[1]).toEqual({ date: "2026-06-08", type: "ready_to_eat", name: "frozen lasagna" });
  });

  it("returns [] for an empty/comment-only file", () => {
    expect(entriesOf({})).toEqual([]);
  });
});

describe("validateNewEntry", () => {
  it("accepts a valid recipe entry", () => {
    expect(validateNewEntry({ date: "2026-06-09", type: "recipe", recipe: "x" })).toBeNull();
  });
  it("rejects a bad date", () => {
    expect(validateNewEntry({ date: "June 9", type: "recipe", recipe: "x" })).toMatch(/date/);
  });
  it("rejects an unknown type", () => {
    expect(validateNewEntry({ date: "2026-06-09", type: "ate_out" as never })).toMatch(/type/);
  });
  it("requires recipe on a recipe entry", () => {
    expect(validateNewEntry({ date: "2026-06-09", type: "recipe" })).toMatch(/recipe/);
  });
  it("requires name on a non-recipe entry", () => {
    expect(validateNewEntry({ date: "2026-06-09", type: "ready_to_eat" })).toMatch(/name/);
  });
});

describe("appendEntries", () => {
  it("appends preserving order", () => {
    const a: CookingLogEntry[] = [{ date: "2026-06-01", type: "recipe", recipe: "a" }];
    const b: CookingLogEntry[] = [{ date: "2026-06-02", type: "ad_hoc", name: "x" }];
    expect(appendEntries(a, b).map((e) => e.date)).toEqual(["2026-06-01", "2026-06-02"]);
  });
});

describe("deriveLastCooked", () => {
  it("maps each recipe slug to its latest cooked date, ignoring non-recipe entries", () => {
    const entries: CookingLogEntry[] = [
      { date: "2026-06-01", type: "recipe", recipe: "salmon" },
      { date: "2026-06-09", type: "recipe", recipe: "salmon" },
      { date: "2026-06-05", type: "recipe", recipe: "tacos" },
      { date: "2026-06-10", type: "ready_to_eat", name: "lasagna" },
    ];
    const m = deriveLastCooked(entries);
    expect(m.get("salmon")).toBe("2026-06-09");
    expect(m.get("tacos")).toBe("2026-06-05");
    expect(m.has("lasagna")).toBe(false);
  });
});
