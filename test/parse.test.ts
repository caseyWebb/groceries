import { describe, it, expect } from "vitest";
import { parseMarkdown, parseToml } from "../src/parse.js";
import { ToolError } from "../src/errors.js";

const RECIPE = `---
title: American Chop Suey
protein: beef
tags: [american, beef]
time_total: 40
---

Brown the beef, add the macaroni and tomatoes.
`;

const COMMENTS_ONLY_TOML = `# pantry.toml — current inventory
# Example entries are all commented out.
# [[items]]
# name = "olive oil"
`;

describe("parseMarkdown", () => {
  it("splits frontmatter and body", () => {
    const { frontmatter, body } = parseMarkdown(RECIPE, "recipe.md");
    expect(frontmatter.title).toBe("American Chop Suey");
    expect(frontmatter.tags).toEqual(["american", "beef"]);
    expect(frontmatter.time_total).toBe(40);
    expect(body.trim()).toBe("Brown the beef, add the macaroni and tomatoes.");
  });

  it("treats a document with no fence as empty frontmatter + full body", () => {
    const { frontmatter, body } = parseMarkdown("# Just markdown\n");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# Just markdown\n");
  });

  it("throws malformed_data on invalid YAML frontmatter", () => {
    const bad = "---\ntitle: [unterminated\n---\nbody\n";
    try {
      parseMarkdown(bad, "bad.md");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).code).toBe("malformed_data");
    }
  });
});

describe("parseToml", () => {
  it("parses a comments-only file to an empty object", () => {
    expect(parseToml(COMMENTS_ONLY_TOML, "pantry.toml")).toEqual({});
  });

  it("parses items arrays", () => {
    const toml = `[[items]]\nname = "olive oil"\ncategory = "pantry"\n`;
    const parsed = parseToml(toml, "pantry.toml");
    expect(parsed.items).toEqual([{ name: "olive oil", category: "pantry" }]);
  });

  it("throws malformed_data on invalid TOML", () => {
    try {
      parseToml("this is = = not toml", "bad.toml");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ToolError);
      expect((e as ToolError).code).toBe("malformed_data");
    }
  });
});
