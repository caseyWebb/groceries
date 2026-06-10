import { describe, it, expect } from "vitest";
import { plannedOf, applyMealPlanOps, dueAndFuture, type PlannedItem } from "../src/meal-plan.js";

describe("plannedOf", () => {
  it("coerces planned rows; missing planned_for becomes null", () => {
    const parsed = { planned: [{ recipe: "a", planned_for: "2026-06-10" }, { recipe: "b" }] };
    expect(plannedOf(parsed)).toEqual([
      { recipe: "a", planned_for: "2026-06-10" },
      { recipe: "b", planned_for: null },
    ]);
  });
  it("returns [] when absent", () => {
    expect(plannedOf({})).toEqual([]);
  });
});

describe("applyMealPlanOps", () => {
  const items: PlannedItem[] = [{ recipe: "salmon", planned_for: "2026-06-10" }];

  it("adds a new row and upserts an existing one", () => {
    const res = applyMealPlanOps(items, [
      { op: "add", recipe: "tacos", planned_for: "2026-06-11" },
      { op: "add", recipe: "salmon", planned_for: "2026-06-12" },
    ]);
    expect(res.items).toContainEqual({ recipe: "tacos", planned_for: "2026-06-11" });
    expect(res.items.find((i) => i.recipe === "salmon")!.planned_for).toBe("2026-06-12");
    expect(res.conflicts).toHaveLength(0);
  });

  it("removes a row and conflicts on a missing one", () => {
    const res = applyMealPlanOps(items, [
      { op: "remove", recipe: "salmon" },
      { op: "remove", recipe: "ghost" },
    ]);
    expect(res.items).toHaveLength(0);
    expect(res.conflicts).toHaveLength(1);
    expect(res.conflicts[0]).toMatchObject({ op: "remove", recipe: "ghost" });
  });

  it("conflicts on an invalid planned_for", () => {
    const res = applyMealPlanOps(items, [{ op: "add", recipe: "x", planned_for: "tomorrow" }]);
    expect(res.applied).toHaveLength(0);
    expect(res.conflicts[0].reason).toMatch(/planned_for/);
  });
});

describe("dueAndFuture", () => {
  it("treats on/before-today and unset as due; future-dated as future", () => {
    const items: PlannedItem[] = [
      { recipe: "past", planned_for: "2026-06-01" },
      { recipe: "today", planned_for: "2026-06-10" },
      { recipe: "future", planned_for: "2026-06-20" },
      { recipe: "unset", planned_for: null },
    ];
    const { due, future } = dueAndFuture(items, "2026-06-10");
    expect(due.map((i) => i.recipe).sort()).toEqual(["past", "today", "unset"]);
    expect(future.map((i) => i.recipe)).toEqual(["future"]);
  });
});
