## ADDED Requirements

### Requirement: Cooking-log and meal-plan structural validation

The system SHALL parse-check `cooking_log.toml` and `meal_plan.toml` during the index build and SHALL hard-fail (non-zero exit) when: either file does not parse as TOML; a `cooking_log` entry omits `date` or `type`, or has a `type` outside the allowed enum (`recipe`, `ready_to_eat`, `ad_hoc`); a `cooking_log` entry with `type = recipe` omits `recipe` or references a slug no recipe resolves to; a non-`recipe` entry omits `name`; a `meal_plan` `[[planned]]` entry omits `recipe` or references an unresolved slug; or any `date` / `planned_for` value is not a valid ISO date.

#### Scenario: Unknown cooking-log type blocks the build

- **WHEN** a `cooking_log.toml` entry declares `type = "snack"`
- **THEN** the build exits non-zero and reports the invalid `type` and entry

#### Scenario: Recipe entry with unresolved slug blocks the build

- **WHEN** a `type = recipe` entry references a slug no recipe file produces
- **THEN** the build exits non-zero and names the unresolved slug

#### Scenario: Planned entry with unresolved slug blocks the build

- **WHEN** a `meal_plan.toml` `[[planned]]` entry references a slug no recipe produces
- **THEN** the build exits non-zero and names the unresolved slug

#### Scenario: Malformed date blocks the build

- **WHEN** a `cooking_log` `date` or `meal_plan` `planned_for` is not a valid ISO date
- **THEN** the build exits non-zero and reports the offending value

### Requirement: last_cooked consistency soft-check

The system SHALL emit a warning, without failing the build, when a recipe's frontmatter `last_cooked` does not equal the maximum `cooking_log.toml` `date` among `type = recipe` entries for that slug. A recipe with no cooking-log entries SHALL NOT warn regardless of its `last_cooked` value, so an empty or partial log does not flag the existing corpus.

#### Scenario: Drift between last_cooked and the log warns

- **WHEN** a recipe's `last_cooked` is earlier than its newest `cooking_log` entry
- **THEN** the build prints a warning naming the recipe and both dates, and still exits successfully

#### Scenario: Recipe absent from the log does not warn

- **WHEN** a recipe has a non-null `last_cooked` but no `cooking_log` entries
- **THEN** the build does not warn about that recipe

### Requirement: Controlled vocabulary for variety dimensions

The system SHALL validate recipe frontmatter `protein` and `cuisine` against controlled allowed-value sets (coarse buckets — e.g. `fish` rather than `salmon`) so variety reasoning is reliable. A `protein` or `cuisine` value **present** but outside its allowed set SHALL be a hard build failure naming the offending value, recipe, and field. Absence of `protein` or `cuisine` SHALL retain the existing warn-only treatment, not a hard failure. The allowed sets SHALL be defined in the validator (alongside the `status` enum) and documented in `docs/SCHEMAS.md`.

#### Scenario: Out-of-vocabulary protein blocks the build

- **WHEN** a recipe declares `protein: salmon` and `salmon` is not in the allowed protein set (e.g. it collapses to `fish`)
- **THEN** the build exits non-zero and reports the invalid value, recipe, and field

#### Scenario: In-vocabulary value passes

- **WHEN** a recipe declares `protein: fish` and `cuisine: filipino`, both in their allowed sets
- **THEN** validation passes for those fields

#### Scenario: Absent dimension warns but does not fail

- **WHEN** a recipe omits `protein`
- **THEN** the build warns (per the existing soft rule) and still exits successfully
