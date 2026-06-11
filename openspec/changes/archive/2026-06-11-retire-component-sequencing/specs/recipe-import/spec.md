## ADDED Requirements

### Requirement: Near-duplicate reconciliation without auto-merge

A final pass SHALL surface near-duplicate recipes for human review rather than merging them automatically.

#### Scenario: Near-duplicates surfaced, not merged

- **WHEN** two recipes look like variants of the same dish (e.g. stovetop vs. pressure-cooker butter chicken)
- **THEN** both are retained and the pair is reported for the user to decide

## REMOVED Requirements

### Requirement: Component reconciliation without auto-merge

**Reason:** The component model is retired, so the import flow no longer wires `uses_components` / `produces_components` across the corpus. The near-duplicate-surfacing behavior that was bundled here is preserved as its own requirement (**Near-duplicate reconciliation without auto-merge**, added above).
