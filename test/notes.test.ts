import { describe, it, expect } from "vitest";
import {
  parseNotes,
  appendNote,
  removeNote,
  updateNote,
  serializeNotes,
  serializeStoreNotes,
  notesPath,
  storeNotesPath,
  aggregateGroupSignal,
  aggregateNotes,
  type Note,
  type TenantSignal,
} from "../src/notes.js";

function note(over: Partial<Note> = {}): Note {
  return { created_at: "2026-06-01T00:00:00.000Z", body: "b", tags: [], private: false, ...over };
}

describe("notesPath", () => {
  it("is the per-slug notes file under the tenant prefix", () => {
    expect(notesPath("miso-salmon")).toBe("notes/miso-salmon.toml");
  });
});

describe("parseNotes / serializeNotes round-trip", () => {
  it("round-trips body, tags, and the private flag", () => {
    const notes: Note[] = [
      note({ body: "subbed gochujang for sriracha", tags: ["tweak"] }),
      note({ created_at: "2026-06-02T00:00:00.000Z", body: "too salty", private: true }),
    ];
    const reparsed = parseNotes(serializeNotes(notes));
    expect(reparsed).toEqual(notes);
  });

  it("absent/empty file → no notes; drops a note with no body", () => {
    expect(parseNotes(null)).toEqual([]);
    expect(parseNotes("")).toEqual([]);
    expect(parseNotes('[[notes]]\ncreated_at = "x"\n')).toEqual([]);
  });

  it("defaults a stored note's tags to [] and private to false", () => {
    const parsed = parseNotes('[[notes]]\ncreated_at = "t"\nbody = "hi"\n');
    expect(parsed).toEqual([{ created_at: "t", body: "hi", tags: [], private: false }]);
  });
});

describe("appendNote", () => {
  it("accretes rather than overwriting (append-mostly)", () => {
    const first = note({ body: "first" });
    const out = appendNote([first], note({ body: "second" }));
    expect(out).toHaveLength(2);
    expect(out[0].body).toBe("first");
    expect(out[1].body).toBe("second");
  });
});

describe("removeNote", () => {
  const a = note({ created_at: "2026-06-01T00:00:00.000Z", body: "first" });
  const b = note({ created_at: "2026-06-02T00:00:00.001Z", body: "second" });

  it("drops the note matching created_at and reports found", () => {
    const { notes, found } = removeNote([a, b], "2026-06-01T00:00:00.000Z");
    expect(found).toBe(true);
    expect(notes).toEqual([b]);
  });

  it("is a no-op (found: false) when no note matches", () => {
    const { notes, found } = removeNote([a, b], "nope");
    expect(found).toBe(false);
    expect(notes).toEqual([a, b]);
  });

  it("leaves the rest intact when removing from the middle", () => {
    const c = note({ created_at: "2026-06-03T00:00:00.002Z", body: "third" });
    const { notes } = removeNote([a, b, c], "2026-06-02T00:00:00.001Z");
    expect(notes).toEqual([a, c]);
  });
});

describe("updateNote", () => {
  const a = note({ created_at: "2026-06-01T00:00:00.000Z", body: "Aisle 7: baking", tags: ["layout"] });
  const b = note({ created_at: "2026-06-02T00:00:00.001Z", body: "keep me" });

  it("patches only the provided fields, keeping created_at as the key", () => {
    const { notes, found } = updateNote([a, b], "2026-06-01T00:00:00.000Z", { body: "Aisle 7: baking, spices" });
    expect(found).toBe(true);
    expect(notes[0]).toEqual({ ...a, body: "Aisle 7: baking, spices" });
    expect(notes[1]).toEqual(b);
  });

  it("can set private to false explicitly (not swallowed by ??)", () => {
    const priv = note({ created_at: "t", body: "x", private: true });
    const { notes } = updateNote([priv], "t", { private: false });
    expect(notes[0].private).toBe(false);
  });

  it("can replace tags", () => {
    const { notes } = updateNote([a, b], "2026-06-01T00:00:00.000Z", { tags: ["location"] });
    expect(notes[0].tags).toEqual(["location"]);
  });

  it("is a no-op (found: false) when no note matches", () => {
    const { notes, found } = updateNote([a, b], "nope", { body: "x" });
    expect(found).toBe(false);
    expect(notes).toEqual([a, b]);
  });
});

describe("aggregateGroupSignal (§8.2)", () => {
  const perTenant: TenantSignal[] = [
    {
      author: "alice",
      notes: [note({ created_at: "2026-06-01T00:00:00.000Z", body: "alice shared" })],
      rating: 5,
      status: "active",
    },
    {
      author: "bob",
      notes: [
        note({ created_at: "2026-06-02T00:00:00.000Z", body: "bob shared" }),
        note({ created_at: "2026-06-03T00:00:00.000Z", body: "bob secret", private: true }),
      ],
      rating: 4,
    },
  ];

  it("shows the group's shared notes attributed to their authors", () => {
    const { notes } = aggregateGroupSignal("alice", perTenant);
    const visible = notes.map((n) => [n.author, n.body]);
    expect(visible).toContainEqual(["alice", "alice shared"]);
    expect(visible).toContainEqual(["bob", "bob shared"]);
  });

  it("excludes another tenant's private note", () => {
    const { notes } = aggregateGroupSignal("alice", perTenant);
    expect(notes.find((n) => n.body === "bob secret")).toBeUndefined();
  });

  it("includes the caller's OWN private note", () => {
    const { notes } = aggregateGroupSignal("bob", perTenant);
    expect(notes.find((n) => n.author === "bob" && n.body === "bob secret")).toBeDefined();
  });

  it("orders notes by timestamp", () => {
    const { notes } = aggregateGroupSignal("bob", perTenant);
    const order = notes.map((n) => n.created_at);
    expect(order).toEqual([...order].sort());
  });

  it("aggregates attributed ratings (never private), sorted by author", () => {
    const { ratings } = aggregateGroupSignal("carol", perTenant);
    expect(ratings).toEqual([
      { author: "alice", rating: 5, status: "active" },
      { author: "bob", rating: 4 },
    ]);
  });

  it("omits a tenant with no rating from the ratings list", () => {
    const signal = aggregateGroupSignal("x", [{ author: "z", notes: [note()] }]);
    expect(signal.ratings).toEqual([]);
  });
});

describe("store notes (in-store-fulfillment D6)", () => {
  it("storeNotesPath is the per-store file under the tenant prefix", () => {
    expect(storeNotesPath("west-7th-tom-thumb")).toBe("store_notes/west-7th-tom-thumb.toml");
  });

  it("serializeStoreNotes round-trips through parseNotes with the store header", () => {
    const notes: Note[] = [
      note({ body: "fish counter closes at 6 PM", tags: ["hours"] }),
      note({ created_at: "2026-06-11T19:05:00.000Z", body: "they stock the Kerrygold I like", private: true }),
    ];
    const text = serializeStoreNotes(notes);
    expect(text).toContain("Store notes authored by this tenant");
    expect(parseNotes(text)).toEqual(notes);
  });

  const perTenant = [
    { author: "alice", notes: [note({ created_at: "2026-06-01T00:00:00.000Z", body: "fish counter closes at 6 PM" })] },
    {
      author: "bob",
      notes: [
        note({ created_at: "2026-06-02T00:00:00.000Z", body: "parking is brutal after 5" }),
        note({ created_at: "2026-06-03T00:00:00.000Z", body: "my coupon stash", private: true }),
      ],
    },
  ];

  it("a shared store note is group-visible and attributed to its author", () => {
    const notes = aggregateNotes("alice", perTenant);
    const visible = notes.map((n) => [n.author, n.body]);
    expect(visible).toContainEqual(["alice", "fish counter closes at 6 PM"]);
    expect(visible).toContainEqual(["bob", "parking is brutal after 5"]);
  });

  it("a private store note is owner-only", () => {
    expect(aggregateNotes("alice", perTenant).find((n) => n.body === "my coupon stash")).toBeUndefined();
    expect(aggregateNotes("bob", perTenant).find((n) => n.body === "my coupon stash")).toBeDefined();
  });
});
