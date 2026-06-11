## REMOVED Requirements

### Requirement: Component cross-links

**Reason:** The component model is retired. `_indexes/components.json` is no longer emitted, so recipe pages have no component adjacency to render. `renderComponents` and its `.components` styles are removed from the site generator. Cross-recipe relationships are instead expressed through `pairs_with` plating edges, which are surfaced conversationally by the agent rather than on the static site.
