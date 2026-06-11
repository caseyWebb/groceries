# Storage guidance — research spike

**Status:** exploration note (not yet a formal OpenSpec change). Seeds the re-cut
of roadmap Change 12 ("Storage-class guidance at put-away") — this is the curated
source material the `storage_guidance/` content tree is built from.
**Date:** 2026-06-11
**Context:** explored while reframing the dead `ingredients.toml` perishability
work. The agent surfaces 2–3 relevant tips at grocery put-away time; this is the
*opinionated, vetted* corpus it draws from.

---

## How this seeds the file tree

Content below is grouped by **storage class** — that grouping maps ~1:1 onto the
planned `storage_guidance/<class>.md` files (tender-herbs, hardy-herbs, basil,
leafy-greens, alliums, potatoes, tomatoes, avocados, berries-grapes, citrus-melon,
mushrooms, carrots, corn, ginger, cucumber-squash, cheese, dairy-eggs, bread,
meat-poultry, fish, and `_ethylene.md` for the relational rules). A few items are
**singletons** (basil, tomatoes, avocados) because they break their class's rule.

**Confidence-in-prose discipline:** solid tips are written plainly; contested ones
are pre-hedged in the prose itself so the agent relays honesty by just reading the
file. The contested/solid table at the bottom is the curation filter. The file
must **never** assert folklore as settled fact, and the agent must **never**
improvise a tip for an item with no matching class file (silence > invention).

## Sourcing caveats (carry into curation)

- ATK produce/herb/bread/food-safety tips were **fetched and verified verbatim**
  from the article bodies.
- Serious Eats, dairy, mushroom, and ginger tips are from **search-result
  summaries** (the SE domain was un-fetchable during the spike) + corroborating
  outlets — solid enough to seed, but worth a verbatim re-check against the primary
  SE article before any single phrasing is treated as authoritative.

---

## Fresh herbs

**Tender herbs (cilantro, parsley, dill, tarragon, mint, chives):** Stand stems in
~1 inch of water, loosely bagged, **in the refrigerator** — or wrap in damp paper
towels in a zip-lock bag in the crisper. They wilt fast and want moisture, but the
leaves must not sit in water or they rot. — [ATK](https://www.americastestkitchen.com/articles/437-how-to-buy-use-and-store-fresh-herbs)
> **Placement verified (2026-06-11 follow-up):** ATK explicitly stores cilantro,
> parsley, mint, dill, tarragon stems-in-water *in the fridge* (verbatim "Store
> fresh mint/dill/tarragon in the refrigerator with its stems in water"). They do
> **not** run a head-to-head fridge-jar vs counter-jar test — placement is asserted,
> not shown. Casey's experience (fridge-jar lasts notably longer) aligns with ATK's
> guidance but the magnitude is unverified.

**Hardy/woody herbs (rosemary, thyme, sage, oregano):** Wrap in a paper towel,
zip-lock bag, crisper — tough leaves keep better drier than tender ones.
*Minor source disagreement:* ATK says damp towel; Serious Eats reportedly says dry
towel for hardy herbs. — [ATK](https://www.americastestkitchen.com/articles/437-how-to-buy-use-and-store-fresh-herbs)

**Basil (singleton — the counter exception):** Stand stem-down in a glass of water
**at room temperature**, like cut flowers. Basil is the **only** herb ATK stores on
the counter; all other tender herbs go in water in the fridge. — [ATK](https://www.americastestkitchen.com/articles/437-how-to-buy-use-and-store-fresh-herbs)
> *Hedge:* the room-temp advice is solid (ATK); the widely-repeated "cold *blackens*
> basil" mechanism is folk-reasoning ATK does not itself state.

---

## Produce — counter (do NOT refrigerate)

**Tomatoes (singleton, nuanced):** Unripe → counter to ripen; dead-ripe → counter for
best flavor, or front-of-fridge to buy time (return to room temp before eating).
Cold mutes flavor and turns texture mealy. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)
> *Genuine ATK↔SE nuance:* ATK leans "counter, period"; SE's taste tests allow the
> fridge once fully ripe. Consensus rule: **unripe → counter; dead-ripe → either.**

**Onions, shallots, garlic:** Cool, dark, ventilated spot at room temp (open basket,
not a sealed bag). Leave garlic's papery skin on until use. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Potatoes & sweet potatoes:** Cool, dark, away from light (light → greening). Do
**not** refrigerate (cold converts starch to sugar, off-flavors). — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Winter squash:** Cool room temp, away from light. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Unripe climacteric fruit (bananas, peaches, nectarines, plums, apricots, mangos,
papayas):** Ripen on the counter out of direct sun; the fridge stalls ripening and
leaves them mealy. Move to the fridge only once ripe. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Avocados (singleton, counterintuitive):** ATK refrigerates even *unripe* avocados
(cold-slowed ripening distributes ethylene more evenly), front of the fridge. To
speed ripening, bag with an apple or banana. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

---

## Produce — refrigerate

**Berries:** Don't wash until use — surface moisture breeds mold. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)
> *Vinegar-rinse, hedged:* ATK endorses a 3:1 water:vinegar rinse on purchase, spun
> very dry, stored paper-towel-lined — vinegar kills surface mold spores. Mechanism
> is real; the "lasts 3 weeks" magnitude is **oversold elsewhere**. Phrase as "some
> cooks rinse on purchase in vinegar solution — results vary."

**Grapes:** Store unrinsed, on the stem — washing/de-stemming opens entry points for
bacteria. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Apples, cherries:** Not chill-sensitive — anywhere in the fridge, including coldest
zones. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Citrus & melons:** Chill-sensitive — refrigerate toward the *front* (warmer zone).
— [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Asparagus:** Trim ends, stand upright in 1–2 inches of water, loosely covered,
like cut flowers. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Broccoli, scallions, celery:** Crisper; revive limp stalks with the asparagus
water treatment. Broccoli is highly ethylene-sensitive (see relational). — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Carrots:** Cut off the leafy tops before storing (tops pull moisture from the
root); open zip-lock bag in the crisper. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Corn:** Husks on; wrap in a wet paper bag/damp towels inside a produce bag,
crisper — cold slows the sugar→starch conversion. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Leafy greens / lettuce:** Keep bagged greens in their original (ethylene-permeable)
packaging; wrap loose heads in moist paper towels in a partially open bag in the
crisper. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Mushrooms:** Paper bag (or original carton), **not** sealed plastic — ~90% water,
they slime in trapped humidity; paper wicks moisture, ~10 days. Bottom shelf, not
the over-humid crisper. — [reported from SE / corroborated](https://www.thekitchn.com/how-to-store-mushrooms-skills-showdown-23228612)

**Cucumbers, zucchini, summer squash:** Wrap tightly in plastic to hold crispness.
— [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

**Ginger:** Unpeeled in the fridge with a paper towel keeps 4–6 weeks; or wrap
tightly and freeze (grate from frozen). — [reported from SE lab tests](https://www.foodnetwork.com/how-to/packages/food-network-essentials/how-to-store-ginger)

---

## Dairy, eggs, bread

**Cheese (counterintuitive):** Wrap in cheese paper or parchment, **not** tight
plastic — cheese needs to breathe; plastic suffocates it and imparts off-flavors.
Re-wrap fresh each time. — [reported from SE (Jake Lahne) / corroborated](https://www.thekitchn.com/how-to-store-cheese-what-to-do-100285)

**Milk:** Coldest part (back), **never** the door — door temps swing most. —
[corroborating](https://www.usdairy.com/food-storage)

**Butter:** Airtight (absorbs fridge odors); freezes ~6 months. Salted keeps longer.
— [corroborating](https://www.usdairy.com/food-storage)

**Eggs:** In the carton, on a main shelf, **not** the door. — [ATK](https://www.americastestkitchen.com/articles/7889-food-safety-101)

**Bread (never the fridge):** Counter/bread box short-term; freeze for longer. The
fridge is the *worst* spot — cold accelerates starch retrogradation, staling ~2× as
fast. Freeze wrapped in foil + zip bag (~1 month), refresh in a 450°F oven. Applies
to cakes/cookies/muffins too. — [ATK](https://www.americastestkitchen.com/articles/7819-don't-refrigerate-baked-goods)

---

## Fresh meat, poultry, fish

**Placement:** Fridge at 35–40°F; store raw proteins well-wrapped on the **bottom**
shelves (no drips onto ready-to-eat food). Top→bottom: cured/smoked → seafood →
whole cuts → ground meat & poultry. — [ATK](https://www.americastestkitchen.com/articles/7889-food-safety-101)

**Shelf life:** Whole cuts 3–5 days; ground meat & seafood 1–2 days; else freeze.
— [ATK](https://www.americastestkitchen.com/articles/7889-food-safety-101)

**Fish:** Wants colder than a home fridge runs — set on a bed of ice on a tray
(drain meltwater) in the coldest spot, cook within a day or two. — [ATK](https://www.americastestkitchen.com/articles/7889-food-safety-101)

---

## `_ethylene.md` — "Don't store these together" (relational)

Ripening produce emits ethylene gas, which over-softens/yellows/spoils ethylene-
*sensitive* items nearby. Keep producers away from sensitive items. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables); [WaPo](https://www.washingtonpost.com/food/2022/05/31/fruit-vegetable-storage-ethylene/); [UCSD ext.](https://ucsdcommunityhealth.org/wp-content/uploads/2017/09/ethylene.pdf)

**High PRODUCERS:** apples, bananas, ripe avocados, tomatoes, peaches/nectarines/
plums/apricots, pears, mangos, cantaloupe, ripe peppers.

**SENSITIVE:** leafy greens, broccoli & Brussels sprouts (very sensitive), asparagus,
cucumbers, carrots, green beans, most herbs.

**Pairwise rules:**
- **Onions ↔ potatoes — store APART.** Potatoes' moisture/gases rot onions; onions
  make potatoes sprout faster. — [Consumer Reports](https://www.consumerreports.org/consumerist/keep-your-onions-garlic-separated-and-other-tips-for-storing-fruits-vegetables/)
- **Apples/bananas ↔ leafy greens & broccoli — apart** (producers wilt them fast).
- **Apples ↔ potatoes — folklore (flag):** "an apple in the potato bin prevents
  sprouting" is widely repeated but **not ATK/SE-verified.** Phrase as folklore or omit.
- **Ripening hack (intentional):** bag an unripe avocado/peach with a banana/apple
  to *speed* ripening — same ethylene, on purpose.
- **General:** don't seal ethylene producers in airtight bags; use perforated/vented
  packaging. — [ATK](https://www.americastestkitchen.com/articles/1561-how-to-store-fruits-and-vegetables)

---

## Contested / folklore filter

| Tip | Status |
|---|---|
| Tender herbs in water — fridge; basil on counter | **Solid** (ATK, verbatim). Placement asserted, not head-to-head tested. |
| Basil on counter, not fridge | **Solid** (ATK). The "cold *blackens* it" mechanism is folk-reasoning. |
| Tomatoes never refrigerate | **Nuanced** — ATK vs SE differ; consensus *unripe→counter, dead-ripe→either*. |
| Berry vinegar rinse | **ATK-endorsed mechanism real; magnitude oversold** elsewhere. |
| Apple in the potato bin stops sprouting | **Folklore** — not ATK/SE-verified. |
| Onions/potatoes apart | **Solid**, widely corroborated. |
| Mushrooms in paper not plastic | **Solid**, strong mechanism. |
| Cheese in paper not plastic | **Solid** (SE/cheesemonger consensus). |
