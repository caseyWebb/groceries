// Workers-runtime-safe parsing (design D3). No gray-matter: split the
// frontmatter fence by hand and parse YAML with js-yaml; parse TOML with
// smol-toml. Both libraries are pure JS and run on workerd. Parse failures
// become a structured `malformed_data` error.

import { load as loadYaml } from "js-yaml";
import { parse as parseTomlRaw } from "smol-toml";
import { ToolError } from "./errors.js";

export interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a markdown document into parsed YAML frontmatter and the remaining
 * body. A document without a leading `---` fence yields empty frontmatter and
 * the whole text as body.
 */
export function parseMarkdown(text: string, label = "document"): ParsedMarkdown {
  const match = FENCE.exec(text);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(match[1]);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new ToolError("malformed_data", `Invalid YAML frontmatter in ${label}: ${message}`);
  }

  const frontmatter =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const body = text.slice(match[0].length);
  return { frontmatter, body };
}

/** Parse a TOML document, mapping failures to a structured `malformed_data` error. */
export function parseToml(text: string, label = "file"): Record<string, unknown> {
  try {
    return parseTomlRaw(text) as Record<string, unknown>;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new ToolError("malformed_data", `Invalid TOML in ${label}: ${message}`);
  }
}
