// Store CRUD tools (in-store-fulfillment capability). Reads/lists the shared
// stores/ registry and persists creates/edits/removals via the atomic commit
// engine. Stores are shared corpus and UNATTRIBUTED — any MCP holder may map or
// edit one with no extra auth gate (the update_discovery_sources posture). The
// pure parse/serialize/apply logic lives in stores.ts; this file is the I/O shell
// (gh reads + commits), mirroring grocery-tools.ts / write-tools.ts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GitHubClient, TreeChange } from "./github.js";
import { readOptional } from "./gh-read.js";
import { ToolError, runTool } from "./errors.js";
import { commitFiles } from "./commit.js";
import {
  listStores,
  readStore,
  storePath,
  serializeStore,
  applyStoreOperations,
  makeNormalizer,
  type Store,
  type Aisle,
  type ItemLocation,
  type StoreOperation,
} from "./stores.js";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const aisleShape = z.object({
  number: z.number().optional(),
  label: z.string().optional(),
  sections: z.array(z.string()).optional(),
});

const itemLocationShape = z.object({
  item: z.string(),
  aisle: z.string(),
  detail: z.string().optional(),
});

const storeOpShape = z.object({
  op: z.enum([
    "set_identity",
    "set_aisles",
    "add_item_location",
    "remove_item_location",
    "add_doesnt_carry",
    "remove_doesnt_carry",
  ]),
  field: z.enum(["name", "label", "chain", "address", "domain"]).optional(),
  value: z.string().optional(),
  aisles: z.array(aisleShape).optional(),
  item: z.string().optional(),
  aisle: z.string().optional(),
  detail: z.string().optional(),
});

function toAisle(raw: z.infer<typeof aisleShape>): Aisle {
  const a: Aisle = { sections: raw.sections ?? [] };
  if (raw.number != null) a.number = raw.number;
  if (raw.label) a.label = raw.label;
  return a;
}

/** Coerce a raw update op (flat shape) into a typed StoreOperation; null = invalid op. */
function toStoreOperation(raw: z.infer<typeof storeOpShape>): StoreOperation | null {
  switch (raw.op) {
    case "set_identity":
      if (!raw.field || raw.value == null) return null;
      return { op: "set_identity", field: raw.field, value: raw.value };
    case "set_aisles":
      return { op: "set_aisles", aisles: (raw.aisles ?? []).map(toAisle) };
    case "add_item_location":
      if (!raw.item || !raw.aisle) return null;
      return { op: "add_item_location", item: raw.item, aisle: raw.aisle, detail: raw.detail };
    case "remove_item_location":
      if (!raw.item) return null;
      return { op: "remove_item_location", item: raw.item };
    case "add_doesnt_carry":
      if (!raw.item) return null;
      return { op: "add_doesnt_carry", item: raw.item };
    case "remove_doesnt_carry":
      if (!raw.item) return null;
      return { op: "remove_doesnt_carry", item: raw.item };
  }
}

/**
 * @param server   the MCP server to register on
 * @param sharedGh the root data-repo client (stores are shared corpus)
 * @param getAliases supplies the shared aliases map so item_location keys normalize
 *   the same way the verify matcher does (synonyms resolve to one hint)
 */
export function registerStoreTools(
  server: McpServer,
  sharedGh: GitHubClient,
  getAliases: () => Promise<Record<string, string>>,
): void {
  server.registerTool(
    "list_stores",
    {
      description:
        "List the stores mapped for the in-store walk. Returns { stores: [{ slug, name, label, domain, has_layout }] } — `has_layout` is true when the store has an aisle map (a richer walk). Reads the shared stores/ directory directly (no index). An empty/absent registry returns { stores: [] } — the walk still works (it degrades to a department-grouped list from general knowledge).",
      inputSchema: {},
    },
    () => runTool(() => listStores(sharedGh)),
  );

  server.registerTool(
    "read_store",
    {
      description:
        "Read one store's objective content by slug: identity (name, label, chain, address, domain), the ordered `aisles` layout (in the store's own sign vocabulary), the sparse `item_locations` (where non-obvious items hide), and `doesnt_carry`. Attributed observations are separate — use read_store_notes for those. Unknown slug → structured not_found.",
      inputSchema: { slug: z.string() },
    },
    ({ slug }) => runTool(() => readStore(sharedGh, slug)),
  );

  server.registerTool(
    "add_store",
    {
      description:
        "Map a new store location into the shared registry (stores/<slug>.toml). `slug` is a kebab-case LOCATION id (west-7th-tom-thumb, not tom-thumb). `name` is required; `label`/`chain`/`address` optional; `domain` defaults to 'grocery'. `aisles` is the ordered walk path (each { number?, label?, sections[] } in the store's own sign vocabulary) — optional, the walk degrades gracefully without it. `item_locations` (normalized item + aisle + optional detail) and `doesnt_carry` are sparse, grown lazily from the walk; usually omitted at creation. Shared corpus, no extra gate. Errors with slug_exists if the slug is already mapped (edit it with update_store instead).",
      inputSchema: {
        slug: z.string(),
        name: z.string(),
        label: z.string().optional(),
        chain: z.string().optional(),
        address: z.string().optional(),
        domain: z.string().optional(),
        aisles: z.array(aisleShape).optional(),
        item_locations: z.array(itemLocationShape).optional(),
        doesnt_carry: z.array(z.string()).optional(),
      },
    },
    (input) =>
      runTool(async () => {
        if (!SLUG_RE.test(input.slug)) {
          throw new ToolError("validation_failed", `Invalid store slug: ${input.slug}`, {
            slug: input.slug,
          });
        }
        if (!input.name.trim()) {
          throw new ToolError("validation_failed", "store name must not be empty", { slug: input.slug });
        }
        const path = storePath(input.slug);
        if ((await readOptional(sharedGh, path)) !== null) {
          throw new ToolError("slug_exists", `Store already mapped: ${input.slug}`, { slug: input.slug });
        }
        const normalize = makeNormalizer(await getAliases());
        const item_locations: ItemLocation[] = (input.item_locations ?? []).map((l) => {
          const loc: ItemLocation = { item: normalize(l.item), aisle: l.aisle };
          if (l.detail) loc.detail = l.detail;
          return loc;
        });
        const store: Store = {
          slug: input.slug,
          name: input.name.trim(),
          domain: input.domain ?? "grocery",
          aisles: (input.aisles ?? []).map(toAisle),
          item_locations,
          doesnt_carry: (input.doesnt_carry ?? []).map((s) => normalize(s)).filter(Boolean),
        };
        if (input.label) store.label = input.label;
        if (input.chain) store.chain = input.chain;
        if (input.address) store.address = input.address;
        const { commit_sha } = await commitFiles(
          sharedGh,
          [{ path, content: serializeStore(store) }],
          `add store: ${store.slug}`,
        );
        return { store, commit_sha };
      }),
  );

  server.registerTool(
    "update_store",
    {
      description:
        "Edit a mapped store with operations (update_pantry-style). Ops: { op:'set_identity', field, value } (field: name|label|chain|address|domain); { op:'set_aisles', aisles:[{number?,label?,sections[]}] } replaces the whole ordered layout (the first-visit mapping path); { op:'add_item_location', item, aisle, detail? } / { op:'remove_item_location', item } grow/prune the sparse where-it-hides hints (item is normalized like pantry verify, so synonyms resolve to one key); { op:'add_doesnt_carry', item } / { op:'remove_doesnt_carry', item } the sparse not-carried set (a found item clears its entry). Returns applied + conflicts (e.g. a remove whose target isn't present). Unknown slug → not_found.",
      inputSchema: { slug: z.string(), operations: z.array(storeOpShape) },
    },
    ({ slug, operations }) =>
      runTool(async () => {
        const store = await readStore(sharedGh, slug); // throws not_found if absent
        const ops: StoreOperation[] = [];
        const conflicts: { op: string; target: string; reason: string }[] = [];
        for (const raw of operations) {
          const op = toStoreOperation(raw);
          if (op) ops.push(op);
          else conflicts.push({ op: raw.op, target: raw.item ?? raw.field ?? "", reason: "operation is missing required fields" });
        }
        const normalize = makeNormalizer(await getAliases());
        const result = applyStoreOperations(store, ops, normalize);
        const allConflicts = [...conflicts, ...result.conflicts];
        if (result.applied.length === 0) {
          return { slug, applied: result.applied, conflicts: allConflicts };
        }
        const { commit_sha } = await commitFiles(
          sharedGh,
          [{ path: storePath(slug), content: serializeStore(result.store) }],
          `update store: ${slug}`,
        );
        return { slug, applied: result.applied, conflicts: allConflicts, commit_sha };
      }),
  );

  server.registerTool(
    "remove_store",
    {
      description:
        "Remove a mapped store from the shared registry (deletes stores/<slug>.toml). Unknown slug → structured not_found. Attributed store notes in members' subtrees are left untouched.",
      inputSchema: { slug: z.string() },
    },
    ({ slug }) =>
      runTool(async () => {
        if (!SLUG_RE.test(slug) || (await readOptional(sharedGh, storePath(slug))) === null) {
          throw new ToolError("not_found", `Unknown store: ${slug}`, { slug });
        }
        const change: TreeChange = { path: storePath(slug), delete: true };
        const { commit_sha } = await commitFiles(sharedGh, [change], `remove store: ${slug}`);
        return { slug, removed: true, commit_sha };
      }),
  );
}
