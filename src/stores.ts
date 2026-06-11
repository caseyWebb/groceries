// Shared store registry (in-store-fulfillment capability). One `stores/<slug>.toml`
// per specific store LOCATION, holding the objective content the in-store walk
// reads: identity, an ordered aisle layout in the store's own sign vocabulary, and
// two sparse facets grown lazily from the walk — `item_locations` (where the
// non-obvious items hide) and `doesnt_carry` (a small negative set). Store content
// is shared and UNATTRIBUTED (like recipe content); attributed observations are
// store notes (src/notes.ts, users/<id>/store_notes/<slug>.toml).
//
// Split like storage-guidance.ts / kitchen.ts: pure parse/serialize/apply logic
// here (unit-testable against plain objects + a fake GitHubClient); the tool
// registration + commit I/O lives in stores-tools.ts. `update_store` operations
// follow the update_pantry / update_kitchen style — an off-target op is a
// structured conflict, never a silent write. There is NO `_indexes/stores.json`:
// the set is small, so `listStores` reads the directory directly (no index).

import { parse as parseTomlRaw, stringify as stringifyTomlRaw } from "smol-toml";
import { GitHubError, type GitHubClient } from "./github.js";
import { readFile } from "./gh-read.js";
import { ToolError } from "./errors.js";
import { normalizeIngredient } from "./matching.js";

export const STORES_DIR = "stores";

// kebab-case location slug; anchored so it also rejects path traversal.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One aisle in the store's own sign vocabulary. `number` OR `label` (or both). */
export interface Aisle {
  number?: number;
  label?: string;
  sections: string[];
}

/** A non-obvious item placement (sparse, grown from the walk). `item` is normalized. */
export interface ItemLocation {
  item: string;
  aisle: string;
  detail?: string;
}

/** Objective store content (shared, unattributed). */
export interface Store {
  slug: string;
  name: string;
  label?: string;
  chain?: string;
  address?: string;
  domain: string;
  aisles: Aisle[];
  item_locations: ItemLocation[];
  doesnt_carry: string[];
}

/** Repo-relative path to a store file (shared corpus root). */
export function storePath(slug: string): string {
  return `${STORES_DIR}/${slug}.toml`;
}

/** Strip the `.md`/`.toml` extension from a store file name; null for non-store entries. */
export function slugFromStoreFile(name: string): string | null {
  if (!name.endsWith(".toml")) return null;
  return name.slice(0, -5);
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function toAisle(raw: Record<string, unknown>): Aisle {
  const a: Aisle = {
    sections: Array.isArray(raw.sections)
      ? raw.sections.filter((s): s is string => typeof s === "string")
      : [],
  };
  if (typeof raw.number === "number") a.number = raw.number;
  const label = asString(raw.label);
  if (label) a.label = label;
  return a;
}

function toItemLocation(raw: Record<string, unknown>): ItemLocation | null {
  const item = asString(raw.item);
  const aisle = raw.aisle != null ? String(raw.aisle) : undefined;
  if (!item || !aisle) return null;
  const loc: ItemLocation = { item, aisle };
  const detail = asString(raw.detail);
  if (detail) loc.detail = detail;
  return loc;
}

/** Normalize a parsed `stores/<slug>.toml` object into the Store shape (defaults applied). */
export function toStore(parsed: Record<string, unknown>): Store {
  const aisles = Array.isArray(parsed.aisles)
    ? (parsed.aisles as Record<string, unknown>[]).map(toAisle)
    : [];
  const item_locations = Array.isArray(parsed.item_locations)
    ? (parsed.item_locations as Record<string, unknown>[])
        .map(toItemLocation)
        .filter((l): l is ItemLocation => l !== null)
    : [];
  const doesnt_carry = Array.isArray(parsed.doesnt_carry)
    ? parsed.doesnt_carry.filter((s): s is string => typeof s === "string")
    : [];
  const store: Store = {
    slug: asString(parsed.slug) ?? "",
    name: asString(parsed.name) ?? "",
    domain: asString(parsed.domain) ?? "grocery",
    aisles,
    item_locations,
    doesnt_carry,
  };
  const label = asString(parsed.label);
  const chain = asString(parsed.chain);
  const address = asString(parsed.address);
  if (label) store.label = label;
  if (chain) store.chain = chain;
  if (address) store.address = address;
  return store;
}

/** Serialize a Store back to `stores/<slug>.toml`, preserving a documentation header. */
export function serializeStore(store: Store): string {
  const header =
    `# stores/${store.slug}.toml — objective store content (shared, unattributed).\n` +
    "# Aisle order is the walk path; item_locations/doesnt_carry are sparse (grown from the walk).\n\n";
  const data: Record<string, unknown> = { slug: store.slug, name: store.name };
  if (store.label) data.label = store.label;
  if (store.chain) data.chain = store.chain;
  if (store.address) data.address = store.address;
  data.domain = store.domain;
  if (store.aisles.length) {
    data.aisles = store.aisles.map((a) => {
      const e: Record<string, unknown> = {};
      if (a.number != null) e.number = a.number;
      if (a.label) e.label = a.label;
      e.sections = a.sections;
      return e;
    });
  }
  if (store.item_locations.length) {
    data.item_locations = store.item_locations.map((l) => {
      const e: Record<string, unknown> = { item: l.item, aisle: l.aisle };
      if (l.detail) e.detail = l.detail;
      return e;
    });
  }
  if (store.doesnt_carry.length) data.doesnt_carry = store.doesnt_carry;
  return header + stringifyTomlRaw(data) + "\n";
}

/** The compact view `list_stores` returns (no full layout — just identity + has-layout). */
export interface StoreListing {
  slug: string;
  name: string;
  label?: string;
  domain: string;
  has_layout: boolean;
}

export function toListing(store: Store): StoreListing {
  const l: StoreListing = {
    slug: store.slug,
    name: store.name,
    domain: store.domain,
    has_layout: store.aisles.length > 0,
  };
  if (store.label) l.label = store.label;
  return l;
}

// --- gh-driven read/list (testable against a fake GitHubClient) -------------

/**
 * List the mapped stores (identity + whether each has an aisle layout). Returns
 * `{ stores: [] }` when the `stores/` tree does not exist yet (an absent registry
 * is not an error — the walk degrades to a department list). No index is read.
 */
export async function listStores(gh: GitHubClient): Promise<{ stores: StoreListing[] }> {
  let dir;
  try {
    dir = await gh.listDir(STORES_DIR);
  } catch (e) {
    if (e instanceof GitHubError) {
      if (e.status === 404) return { stores: [] };
      throw new ToolError("upstream_unavailable", e.message);
    }
    throw e;
  }
  const slugs = dir
    .filter((e) => e.type === "file")
    .map((e) => slugFromStoreFile(e.name))
    .filter((s): s is string => s !== null);
  const stores = await Promise.all(
    slugs.map(async (slug) => {
      const text = await readFile(gh, storePath(slug), "not_found", `Unknown store: ${slug}`);
      return toListing(toStore(parseTomlRaw(text) as Record<string, unknown>));
    }),
  );
  stores.sort((a, b) => a.slug.localeCompare(b.slug));
  return { stores };
}

/** Read one store's objective content. Unknown (or malformed) slug → structured not_found. */
export async function readStore(gh: GitHubClient, slug: string): Promise<Store> {
  if (!SLUG_RE.test(slug)) {
    throw new ToolError("not_found", `Unknown store: ${slug}`, { slug });
  }
  const text = await readFile(gh, storePath(slug), "not_found", `Unknown store: ${slug}`);
  return toStore(parseTomlRaw(text) as Record<string, unknown>);
}

// --- pure operations (update_store, update_pantry-style) --------------------

export type StoreOperation =
  // Identity edits (set a top-level field).
  | { op: "set_identity"; field: "name" | "label" | "chain" | "address" | "domain"; value: string }
  // Replace the whole ordered aisle layout (the first-visit mapping path).
  | { op: "set_aisles"; aisles: Aisle[] }
  // Lazy facet growth, grown from the walk.
  | { op: "add_item_location"; item: string; aisle: string; detail?: string }
  | { op: "remove_item_location"; item: string }
  | { op: "add_doesnt_carry"; item: string }
  | { op: "remove_doesnt_carry"; item: string };

export interface StoreApplied {
  op: StoreOperation["op"];
  target: string;
}

export interface StoreConflict {
  op: StoreOperation["op"];
  target: string;
  reason: string;
}

export interface StoreApplyResult {
  store: Store;
  applied: StoreApplied[];
  conflicts: StoreConflict[];
}

const IDENTITY_FIELDS = ["name", "label", "chain", "address", "domain"] as const;

/**
 * Apply update operations in order. `normalize` canonicalizes an item name the
 * same way the verify matcher does (so "green onions"/"scallions" resolve to one
 * `item_location` key). A remove of an absent target is a conflict; an add that
 * would duplicate an existing key is idempotent (re-points the location / no-op).
 */
export function applyStoreOperations(
  store: Store,
  operations: StoreOperation[],
  normalize: (name: string) => string,
): StoreApplyResult {
  const next: Store = {
    ...store,
    aisles: store.aisles.map((a) => ({ ...a, sections: [...a.sections] })),
    item_locations: store.item_locations.map((l) => ({ ...l })),
    doesnt_carry: [...store.doesnt_carry],
  };
  const applied: StoreApplied[] = [];
  const conflicts: StoreConflict[] = [];

  for (const op of operations) {
    if (op.op === "set_identity") {
      if (!(IDENTITY_FIELDS as readonly string[]).includes(op.field)) {
        conflicts.push({ op: op.op, target: op.field, reason: "not a settable identity field" });
        continue;
      }
      if (op.field === "name" && !op.value.trim()) {
        conflicts.push({ op: op.op, target: op.field, reason: "name must not be empty" });
        continue;
      }
      next[op.field] = op.value;
      applied.push({ op: op.op, target: op.field });
    } else if (op.op === "set_aisles") {
      next.aisles = op.aisles.map((a) => ({ ...a, sections: [...(a.sections ?? [])] }));
      applied.push({ op: op.op, target: `${next.aisles.length} aisle(s)` });
    } else if (op.op === "add_item_location") {
      const item = normalize(op.item);
      if (!item || !op.aisle) {
        conflicts.push({ op: op.op, target: op.item, reason: "item and aisle are required" });
        continue;
      }
      const loc: ItemLocation = { item, aisle: op.aisle };
      if (op.detail) loc.detail = op.detail;
      const idx = next.item_locations.findIndex((l) => l.item === item);
      if (idx >= 0) next.item_locations[idx] = loc;
      else next.item_locations.push(loc);
      applied.push({ op: op.op, target: item });
    } else if (op.op === "remove_item_location") {
      const item = normalize(op.item);
      const idx = next.item_locations.findIndex((l) => l.item === item);
      if (idx < 0) {
        conflicts.push({ op: op.op, target: op.item, reason: "no item_location with that item" });
      } else {
        next.item_locations.splice(idx, 1);
        applied.push({ op: op.op, target: item });
      }
    } else if (op.op === "add_doesnt_carry") {
      const item = normalize(op.item);
      if (!item) {
        conflicts.push({ op: op.op, target: op.item, reason: "item is required" });
      } else if (!next.doesnt_carry.includes(item)) {
        next.doesnt_carry.push(item);
        applied.push({ op: op.op, target: item });
      }
    } else if (op.op === "remove_doesnt_carry") {
      const item = normalize(op.item);
      const idx = next.doesnt_carry.indexOf(item);
      if (idx < 0) {
        conflicts.push({ op: op.op, target: op.item, reason: "not in doesnt_carry" });
      } else {
        next.doesnt_carry.splice(idx, 1);
        applied.push({ op: op.op, target: item });
      }
    }
  }

  return { store: next, applied, conflicts };
}

/** Build the normalize fn `update_store` uses, closing over the shared aliases map. */
export function makeNormalizer(aliases: Record<string, string>): (name: string) => string {
  return (name: string) => normalizeIngredient(name, aliases);
}
