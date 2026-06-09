// Registers the six repo-data read tools on an McpServer. Each tool reads via
// the shared GitHub client and returns a structured result; failures map to the
// structured-error convention (errors.ts).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Env } from "./env.js";
import { createGitHubClient, GitHubError, type GitHubClient } from "./github.js";
import { parseMarkdown, parseToml } from "./parse.js";
import { ToolError, runTool } from "./errors.js";
import { filterRecipes, type RecipeFilters, type RecipeIndex } from "./recipes.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const recipeFiltersShape = {
  status: z.string().optional(),
  protein: z.string().optional(),
  cuisine: z.string().optional(),
  tags: z.array(z.string()).optional(),
  season: z.array(z.string()).optional(),
  dietary: z.array(z.string()).optional(),
  max_time_total: z.number().optional(),
  not_cooked_since: z.string().optional(),
  exclude_cooked_within_days: z.number().optional(),
};

const pantryFilterShape = {
  category: z.string().optional(),
  prepared_only: z.boolean().optional(),
  stale_only: z.boolean().optional(),
};

/** Read a file, mapping a 404 to `notFoundCode` and other failures to upstream. */
async function readFile(
  gh: GitHubClient,
  path: string,
  notFoundCode: "not_found" | "index_unavailable",
  notFoundMessage: string,
): Promise<string> {
  try {
    return await gh.getFile(path);
  } catch (e) {
    if (e instanceof GitHubError) {
      if (e.status === 404) throw new ToolError(notFoundCode, notFoundMessage);
      throw new ToolError("upstream_unavailable", e.message);
    }
    throw e;
  }
}

export function buildServer(env: Env): McpServer {
  const server = new McpServer({ name: "grocery-mcp", version: "0.1.0" });
  const gh = createGitHubClient(env);

  server.registerTool(
    "list_recipes",
    {
      description:
        "List recipes from the index, filtered. Array filters (tags/season/dietary) match ALL listed values. status defaults to 'active'; pass 'all' to include every status. exclude_cooked_within_days is a caller-supplied window.",
      inputSchema: { filters: z.object(recipeFiltersShape).optional() },
    },
    ({ filters }) =>
      runTool(async () => {
        const raw = await readFile(
          gh,
          "_indexes/recipes.json",
          "index_unavailable",
          "_indexes/recipes.json is missing",
        );
        let index: RecipeIndex;
        try {
          index = JSON.parse(raw) as RecipeIndex;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          throw new ToolError("index_unavailable", `_indexes/recipes.json is malformed: ${message}`);
        }
        return { recipes: filterRecipes(index, (filters ?? {}) as RecipeFilters) };
      }),
  );

  server.registerTool(
    "read_recipe",
    {
      description: "Read a single recipe's parsed frontmatter and markdown body by slug.",
      inputSchema: { slug: z.string() },
    },
    ({ slug }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug)) {
          throw new ToolError("not_found", `Unknown recipe slug: ${slug}`, { slug });
        }
        const text = await readFile(
          gh,
          `recipes/${slug}.md`,
          "not_found",
          `Unknown recipe slug: ${slug}`,
        );
        const { frontmatter, body } = parseMarkdown(text, `recipes/${slug}.md`);
        return { slug, frontmatter, body };
      }),
  );

  server.registerTool(
    "read_pantry",
    {
      description:
        "Read pantry items. Supports category and prepared_only filters. stale_only is not yet supported (needs ingredients.toml).",
      inputSchema: { filter: z.object(pantryFilterShape).optional() },
    },
    ({ filter }) =>
      runTool(async () => {
        if (filter?.stale_only) {
          throw new ToolError(
            "unsupported",
            "stale_only requires shelf-life data (ingredients.toml), introduced in a later change.",
          );
        }
        const text = await readFile(gh, "pantry.toml", "not_found", "pantry.toml is missing");
        const parsed = parseToml(text, "pantry.toml");
        let items = Array.isArray(parsed.items) ? (parsed.items as Record<string, unknown>[]) : [];
        if (filter?.category !== undefined) {
          items = items.filter((i) => i.category === filter.category);
        }
        if (filter?.prepared_only) {
          items = items.filter((i) => i.prepared_from != null);
        }
        return { items };
      }),
  );

  server.registerTool(
    "read_preferences",
    {
      description: "Return the parsed contents of preferences.toml.",
      inputSchema: {},
    },
    () =>
      runTool(async () => {
        const text = await readFile(
          gh,
          "preferences.toml",
          "not_found",
          "preferences.toml is missing",
        );
        return parseToml(text, "preferences.toml");
      }),
  );

  server.registerTool(
    "read_taste",
    {
      description: "Return the raw markdown of taste.md (the user's taste profile narrative).",
      inputSchema: {},
    },
    () =>
      runTool(async () => {
        const content = await readFile(gh, "taste.md", "not_found", "taste.md is missing");
        return { content };
      }),
  );

  server.registerTool(
    "read_diet_principles",
    {
      description: "Return the raw markdown of diet_principles.md (variety rules narrative).",
      inputSchema: {},
    },
    () =>
      runTool(async () => {
        const content = await readFile(
          gh,
          "diet_principles.md",
          "not_found",
          "diet_principles.md is missing",
        );
        return { content };
      }),
  );

  return server;
}
