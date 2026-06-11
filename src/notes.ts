// Recipe notes (recipe-notes capability, D6). A note is a free-form, attributed
// markdown annotation on a recipe (shared or personal). Notes are the spin-capture
// mechanism that makes the shared corpus safe: a tweak ("subbed gochujang") is a
// note, never an edit to shared content.
//
// Storage: notes live in the AUTHORING tenant's own subtree at
// `users/<id>/notes/<slug>.toml`, so authorship is STRUCTURAL — established by the
// path the note lives under, not a spoofable `author` field. Adding a note is
// append-mostly: read the slug's existing notes, append, commit; prior notes are
// never overwritten and shared content is never touched. A `private` note is
// visible only to its author; the default is shared (collaborative trusted group).
//
// Reads aggregate across the group at request time (§8.2): the worker enumerates
// the tenant directory, reads each tenant's `notes/<slug>.toml`, and merges —
// excluding other tenants' private notes.

import { parse as parseTomlRaw, stringify as stringifyTomlRaw } from "smol-toml";

/** One note as stored (author is the enclosing `users/<id>/` path, not a field). */
export interface Note {
  created_at: string;
  body: string;
  tags: string[];
  private: boolean;
}

/** A note surfaced in a group read, carrying its (structural) author. */
export interface AttributedNote extends Note {
  author: string;
}

/** One tenant's contribution to a recipe's group signal. */
export interface TenantSignal {
  author: string;
  notes: Note[];
  /** The author's overlay rating for the slug, if any. */
  rating?: unknown;
  /** The author's overlay status for the slug, if any. */
  status?: unknown;
}

/** A recipe's aggregated group signal: attributed notes + attributed ratings. */
export interface GroupSignal {
  notes: AttributedNote[];
  ratings: { author: string; rating: unknown; status?: unknown }[];
}

/** Repo-relative path to a tenant's recipe-notes file for a slug (under the tenant prefix). */
export function notesPath(slug: string): string {
  return `notes/${slug}.toml`;
}

/** Repo-relative path to a tenant's STORE-notes file for a store slug (D6, store analog). */
export function storeNotesPath(slug: string): string {
  return `store_notes/${slug}.toml`;
}

const RECIPE_NOTES_HEADER =
  "# Recipe notes authored by this tenant (one file per recipe slug).\n" +
  "# Append-mostly; author is the users/<id>/ path, not a field. private → owner-only.\n\n";

const STORE_NOTES_HEADER =
  "# Store notes authored by this tenant (one file per store slug).\n" +
  "# Append-mostly; author is the users/<id>/ path, not a field. private → owner-only.\n\n";

/** Parse a `notes/<slug>.toml` body's `[[notes]]` array; absent/empty → []. */
export function parseNotes(text: string | null): Note[] {
  if (!text) return [];
  const parsed = parseTomlRaw(text) as Record<string, unknown>;
  const raw = Array.isArray(parsed.notes) ? (parsed.notes as Record<string, unknown>[]) : [];
  const out: Note[] = [];
  for (const n of raw) {
    if (typeof n.body !== "string") continue;
    out.push({
      created_at: typeof n.created_at === "string" ? n.created_at : "",
      body: n.body,
      tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === "string") : [],
      private: n.private === true,
    });
  }
  return out;
}

/** Append a note (append-mostly: existing notes are retained, never overwritten). */
export function appendNote(existing: Note[], note: Note): Note[] {
  return [...existing, note];
}

/** Serialize notes back to a `[[notes]]` file, preserving a documentation header. */
export function serializeNotes(notes: Note[], header: string = RECIPE_NOTES_HEADER): string {
  const data = {
    notes: notes.map((n) => {
      const e: Record<string, unknown> = { created_at: n.created_at, body: n.body };
      if (n.tags.length) e.tags = n.tags;
      if (n.private) e.private = true;
      return e;
    }),
  };
  return header + stringifyTomlRaw(data) + "\n";
}

/** Serialize a tenant's store notes (same shape as recipe notes, store-specific header). */
export function serializeStoreNotes(notes: Note[]): string {
  return serializeNotes(notes, STORE_NOTES_HEADER);
}

/**
 * Apply the group privacy rule to a set of per-tenant note contributions and
 * return attributed notes: include a note if it is non-private OR authored by the
 * caller. Ordered by timestamp (stable, author as tiebreak). Shared by recipe-note
 * and store-note aggregation.
 */
export function aggregateNotes(
  callerId: string,
  perTenant: { author: string; notes: Note[] }[],
): AttributedNote[] {
  const notes: AttributedNote[] = [];
  for (const t of perTenant) {
    for (const n of t.notes) {
      if (n.private && t.author !== callerId) continue;
      notes.push({ ...n, author: t.author });
    }
  }
  notes.sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.author < b.author ? -1 : 1,
  );
  return notes;
}

/**
 * Aggregate a recipe's group signal from each tenant's contribution (§8.2).
 * Notes: include a note if it is non-private OR authored by the caller, so the
 * caller sees their own private notes and the group's shared notes, but never any
 * other tenant's private note. Ratings: attributed, never private — include any
 * tenant that has a rating for the slug. Notes are ordered by timestamp (stable);
 * ratings by author for determinism.
 */
export function aggregateGroupSignal(callerId: string, perTenant: TenantSignal[]): GroupSignal {
  const notes = aggregateNotes(callerId, perTenant);
  const ratings: { author: string; rating: unknown; status?: unknown }[] = [];
  for (const t of perTenant) {
    if (t.rating != null) {
      ratings.push(
        t.status != null
          ? { author: t.author, rating: t.rating, status: t.status }
          : { author: t.author, rating: t.rating },
      );
    }
  }
  ratings.sort((a, b) => (a.author < b.author ? -1 : a.author > b.author ? 1 : 0));
  return { notes, ratings };
}
