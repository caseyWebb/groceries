---
name: map-grocery-store
description: "Map a store's aisle layout while I shop it, so next time the shopping list comes out aisle-ordered. Use when I'm at a store we haven't mapped and want to record it — \"let's map this store\", \"I'm at the new Sprouts, want to map it?\" — or when shopping-list finds an unmapped store I'm walking. Runs alongside the trip (not a separate errand): aisle by aisle off the end-cap signs, reminding me to grab list items as we pass them, saving each aisle as we go. Ends by restocking the pantry."
---

> **Prerequisite** — if you haven't already this session, read the `grocery-core` and `grocery-cart` skills before continuing.

# Map a grocery store (map-grocery-store)

This is **mapping while shopping** — not a separate errand. I'm walking an unmapped store; you record its layout as we go so the next `shopping-list` comes out aisle-ordered. Hands-free / voice-first, **one aisle at a time**, and it doubles as the shopping walk (remind me to grab list items as we hit their aisle).

1. **Offer, never push.** This starts when I'm at a store with no map and *want* to record it — either I ask, or `shopping-list` found an unmapped store I'm walking and offered. If I decline, drop it and just shop the degraded department list; mapping is pure upside that accrues through use, never a precondition.

2. **Register the store, then read the list.** If the store isn't in the registry, `add_store(slug, name, domain, …)` — a kebab-case **location** slug (`west-7th-tom-thumb`, not `tom-thumb`), `domain` per its category. Then `read_grocery_list` (and `read_store_notes(slug)` for anything already known) so you can match aisles to what I need.

3. **Walk it aisle by aisle, saving as you go.** At each aisle, ask what the **end-cap sign** says ("what's this aisle? read the sign hanging at the end"). Record it immediately as a `layout` note — `add_store_note(slug, "Aisle 7: baking, spices, oils", tags:["layout"])` — **lead the body with the aisle number** (the number is the walk order) and list the sections in the store's **own** sign words. **Commit each aisle as we pass it**, never batched to the end — if the trip gets cut short, what we mapped is already saved. If the aisle numbers jump (I call out 7 right after 5), gently check whether we skipped one — "did we pass aisle 6, or no 6 here?" — before moving on; don't force it (stores skip numbers and have unnumbered perimeter zones).

4. **Grab list items as we hit their aisle.** When an aisle's sections cover something on my list, remind me to grab it ("this aisle's got the baking stuff — grab the flour and brown sugar"). If something hides somewhere non-obvious (the harissa's over in the international aisle), *offer* a `location` note (`tags:["location"]`); if the store doesn't carry a listed item, *offer* a `stock` note (`tags:["stock"]`). Only write on my confirmation — never silently. When we reach a frozen or refrigerated aisle, remind me to grab those **last** if I can (cold chain) — or at least not let them sit warm — since here we're following the store's physical order, not reordering.

5. **Complete → received (the same restock as a Kroger pickup).** Before wrapping up, sweep the list for anything we never matched to an aisle — "you've still got harissa and flour unticked; did we pass those, or should we double back?" — a skipped aisle often hides here. Then, when we're done, picked items go straight `active → received` — **no `in_cart`/`ordered` stage**. Persist it in **one** `commit_changes`: remove the picked items via `grocery_list_ops` and — **for `grocery`-kind items only** — restock the pantry via `pantry_operations`; `household`/`other` never touch the pantry. Then, for the fresh perishables just received, offer a couple of storage tips following the **Putting groceries away** guidance.
