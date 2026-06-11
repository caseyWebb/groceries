// Recipe-note tools (recipe-notes capability, §8). Two tools:
//   - add_recipe_note — append an attributed note to THIS tenant's subtree
//     (users/<id>/notes/<slug>.toml). Never touches shared content or prior notes.
//   - read_recipe_notes — aggregate the group's notes + ratings for a recipe at
//     read time: enumerate the tenant directory, read each tenant's notes/overlay
//     from the shared repo (root client addresses any subtree), merge with the
//     caller's privacy rules applied (others' private notes excluded).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GitHubClient, TreeFile } from "./github.js";
import type { TenantStore } from "./tenant.js";
import { userPrefix } from "./tenant.js";
import { readOptional } from "./gh-read.js";
import { ToolError, runTool } from "./errors.js";
import { commitFiles } from "./commit.js";
import { parseOverlay } from "./overlay.js";
import {
  parseNotes,
  appendNote,
  serializeNotes,
  serializeStoreNotes,
  notesPath,
  storeNotesPath,
  aggregateGroupSignal,
  aggregateNotes,
  type Note,
  type TenantSignal,
} from "./notes.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * @param sharedGh  root data-repo client (addresses any `users/<id>/` subtree)
 * @param personalGh this tenant's prefixed client (writes land under users/<id>/)
 * @param tenantId  the caller — author of new notes + privacy boundary on reads
 * @param directory the tenant allowlist, enumerated to aggregate group signal
 */
export function registerNoteTools(
  server: McpServer,
  sharedGh: GitHubClient,
  personalGh: GitHubClient,
  tenantId: string,
  directory: TenantStore,
): void {
  server.registerTool(
    "add_recipe_note",
    {
      description:
        "Append an attributed note to a recipe (shared or personal) in YOUR notes — the spin-capture mechanism (D6). Use this for tweaks/observations ('subbed gochujang for sriracha, better') instead of editing shared recipe content. Append-mostly: prior notes are retained. Author is structural (your subtree), not a field. Set private=true to keep a note to yourself; default is shared with the group. Optional tags (e.g. 'tweak', 'observation').",
      inputSchema: {
        slug: z.string(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        private: z.boolean().optional(),
      },
    },
    ({ slug, body, tags, private: isPrivate }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug)) {
          throw new ToolError("validation_failed", `Invalid recipe slug: ${slug}`, { slug });
        }
        if (!body.trim()) {
          throw new ToolError("validation_failed", "note body must not be empty", { slug });
        }
        const path = notesPath(slug);
        const existing = parseNotes(await readOptional(personalGh, path));
        const note: Note = {
          created_at: nowIso(),
          body,
          tags: tags ?? [],
          private: isPrivate ?? false,
        };
        const file: TreeFile = { path, content: serializeNotes(appendNote(existing, note)) };
        const { commit_sha } = await commitFiles(personalGh, [file], `note on ${slug}`);
        return { slug, author: tenantId, created_at: note.created_at, commit_sha };
      }),
  );

  server.registerTool(
    "read_recipe_notes",
    {
      description:
        "Read the GROUP's notes and ratings for a recipe — the collaborative cookbook view. Returns { notes: [{ author, created_at, body, tags, private }], ratings: [{ author, rating, status }] } aggregated across everyone in your group. You see your own private notes plus everyone's shared notes; other people's private notes are never shown. Use it to surface group signal ('rated 4+ by others') before recommending a recipe someone hasn't tried.",
      inputSchema: { slug: z.string() },
    },
    ({ slug }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug)) {
          throw new ToolError("not_found", `Unknown recipe slug: ${slug}`, { slug });
        }
        const ids = await directory.list();
        const perTenant: TenantSignal[] = [];
        for (const id of ids) {
          const prefix = userPrefix(id);
          const [notesText, overlayText] = await Promise.all([
            readOptional(sharedGh, `${prefix}/${notesPath(slug)}`),
            readOptional(sharedGh, `${prefix}/overlay.toml`),
          ]);
          const notes = parseNotes(notesText);
          const row = overlayText ? parseOverlay(overlayText)[slug] : undefined;
          if (notes.length === 0 && row?.rating == null) continue;
          perTenant.push({ author: id, notes, rating: row?.rating, status: row?.status });
        }
        return { slug, ...aggregateGroupSignal(tenantId, perTenant) };
      }),
  );
}

/**
 * Store notes (in-store-fulfillment, D6) — the store analog of recipe notes,
 * verbatim: attributed, append-mostly, shared-by-default with an optional private
 * flag, authored structurally in the caller's `users/<id>/store_notes/<slug>.toml`
 * and aggregated across the group at read time. No overlay/ratings (a store has no
 * per-tenant disposition the way a recipe does — just notes).
 */
export function registerStoreNoteTools(
  server: McpServer,
  sharedGh: GitHubClient,
  personalGh: GitHubClient,
  tenantId: string,
  directory: TenantStore,
): void {
  server.registerTool(
    "add_store_note",
    {
      description:
        "Append an attributed note to a store (the store analog of add_recipe_note). Use for both objective observations ('fish counter closes at 6 PM', 'parking is brutal after 5') and personal ones ('they stock the Kerrygold I like'). Append-mostly; author is structural (your subtree), not a field. Set private=true to keep a note to yourself; default is shared with the group. Optional tags. Objective STRUCTURED facts (an item's aisle, a not-carried item) belong in the shared store via update_store — a note is for freeform observations.",
      inputSchema: {
        slug: z.string(),
        body: z.string(),
        tags: z.array(z.string()).optional(),
        private: z.boolean().optional(),
      },
    },
    ({ slug, body, tags, private: isPrivate }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug)) {
          throw new ToolError("validation_failed", `Invalid store slug: ${slug}`, { slug });
        }
        if (!body.trim()) {
          throw new ToolError("validation_failed", "note body must not be empty", { slug });
        }
        const path = storeNotesPath(slug);
        const existing = parseNotes(await readOptional(personalGh, path));
        const note: Note = {
          created_at: nowIso(),
          body,
          tags: tags ?? [],
          private: isPrivate ?? false,
        };
        const file: TreeFile = { path, content: serializeStoreNotes(appendNote(existing, note)) };
        const { commit_sha } = await commitFiles(personalGh, [file], `store note on ${slug}`);
        return { slug, author: tenantId, created_at: note.created_at, commit_sha };
      }),
  );

  server.registerTool(
    "read_store_notes",
    {
      description:
        "Read the GROUP's attributed notes for a store. Returns { notes: [{ author, created_at, body, tags, private }] } aggregated across everyone in your group. You see your own private notes plus everyone's shared notes; other people's private notes are never shown. Surface these alongside read_store during the walk (hours, parking, where-they-stock-X).",
      inputSchema: { slug: z.string() },
    },
    ({ slug }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug)) {
          throw new ToolError("not_found", `Unknown store: ${slug}`, { slug });
        }
        const ids = await directory.list();
        const perTenant: { author: string; notes: Note[] }[] = [];
        for (const id of ids) {
          const prefix = userPrefix(id);
          const notesText = await readOptional(sharedGh, `${prefix}/${storeNotesPath(slug)}`);
          const notes = parseNotes(notesText);
          if (notes.length === 0) continue;
          perTenant.push({ author: id, notes });
        }
        return { slug, notes: aggregateNotes(tenantId, perTenant) };
      }),
  );
}
