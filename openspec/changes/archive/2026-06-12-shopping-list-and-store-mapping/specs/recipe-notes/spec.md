## ADDED Requirements

### Requirement: An author may edit or delete their own notes

The system SHALL allow an author to edit or delete a note **they** authored, via `update_recipe_note(slug, created_at, body?, tags?, private?)` and `remove_recipe_note(slug, created_at)`, addressing the note by its `created_at` (a millisecond-precision ISO timestamp, distinct per write). These operations SHALL act **only** on notes in the caller's own subtree — a tenant SHALL NOT edit or delete another tenant's note — and SHALL persist atomically. Editing or deleting a note SHALL NOT modify shared recipe content or any other tenant's notes. This relaxes the prior append-only posture for the author's own notes while preserving structural authorship and cross-tenant immutability. (The same `update`/`remove` capability is provided for store notes under the `in-store-fulfillment` capability, backed by a shared note-mutation core.)

#### Scenario: Author edits their own note

- **WHEN** the author of a note calls `update_recipe_note` with that note's `created_at` and a new body
- **THEN** the note's body is replaced in the author's subtree and committed, leaving shared recipe content and other notes untouched

#### Scenario: Author deletes their own note

- **WHEN** the author calls `remove_recipe_note` with one of their notes' `created_at`
- **THEN** that note is removed from the author's subtree and the change is committed

#### Scenario: Another tenant's note is not addressable

- **WHEN** a tenant calls `update_recipe_note` / `remove_recipe_note` with a `created_at` that matches only another tenant's note
- **THEN** the operation is a structured no-op / `not_found` and that note is unchanged
