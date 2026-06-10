// Pure list_recipes filtering (design D5). No I/O here so it is unit-testable;
// the tool wrapper supplies the index and the reference "now".

export interface RecipeFilters {
  status?: string;
  protein?: string;
  cuisine?: string;
  query?: string;
  season?: string[];
  dietary?: string[];
  max_time_total?: number;
  not_cooked_since?: string;
  exclude_cooked_within_days?: number;
}

/** A recipe index entry: parsed frontmatter plus the injected slug. */
export type IndexedRecipe = Record<string, unknown> & { slug: string };
export type RecipeIndex = Record<string, IndexedRecipe>;

export interface RecipeListItem {
  slug: string;
  title: unknown;
  frontmatter: IndexedRecipe;
}

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

/** YYYY-MM-DD for a Date, in UTC, for lexicographic date comparison. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Apply filter semantics:
 * - array filters (season/dietary) match ALL listed values (AND); no tags filter
 * - status defaults to "active"; status "all" disables status filtering
 * - not_cooked_since admits recipes with null last_cooked (never cooked)
 * - exclude_cooked_within_days drops recipes cooked within N days of `now`
 * - query is the single title+tags text search: tokenize on whitespace, drop
 *   stopwords (connectives), then match when EVERY remaining token is a
 *   case-insensitive substring of the title or any tag (token-AND; deterministic
 *   membership, no ranking). An all-stopword query applies no text narrowing.
 */

/** Connectives dropped from a query so "chicken and rice" ≡ "chicken rice". */
const QUERY_STOPWORDS = new Set([
  "and",
  "or",
  "with",
  "the",
  "a",
  "an",
  "of",
  "in",
  "on",
  "for",
  "&",
]);

/** Tokenize a query: lowercase, split on whitespace, drop empties and stopwords. */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !QUERY_STOPWORDS.has(t));
}

export function filterRecipes(
  index: RecipeIndex,
  filters: RecipeFilters = {},
  now: Date = new Date(),
): RecipeListItem[] {
  const wantStatus = filters.status === "all" ? null : (filters.status ?? "active");

  const qTokens = queryTokens(filters.query ?? "");

  let cutoffWithin: string | null = null;
  if (typeof filters.exclude_cooked_within_days === "number") {
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - filters.exclude_cooked_within_days);
    cutoffWithin = isoDay(cutoff);
  }

  const out: RecipeListItem[] = [];

  for (const recipe of Object.values(index)) {
    if (wantStatus !== null && recipe.status !== wantStatus) continue;
    if (filters.protein !== undefined && recipe.protein !== filters.protein) continue;
    if (filters.cuisine !== undefined && recipe.cuisine !== filters.cuisine) continue;

    if (filters.season?.length) {
      const season = asArray(recipe.season);
      if (!filters.season.every((s) => season.includes(s))) continue;
    }
    if (filters.dietary?.length) {
      const dietary = asArray(recipe.dietary);
      if (!filters.dietary.every((d) => dietary.includes(d))) continue;
    }

    if (qTokens.length) {
      const title = typeof recipe.title === "string" ? recipe.title.toLowerCase() : "";
      const tags = asArray(recipe.tags).map((t) => String(t).toLowerCase());
      const haystack = `${title} ${tags.join(" ")}`;
      if (!qTokens.every((tok) => haystack.includes(tok))) continue;
    }

    if (typeof filters.max_time_total === "number") {
      const t = recipe.time_total;
      if (typeof t !== "number" || t > filters.max_time_total) continue;
    }

    const lastCooked = recipe.last_cooked;
    const cookedStr = typeof lastCooked === "string" ? lastCooked : null;

    // not_cooked_since: keep if never cooked, or cooked strictly before the date.
    if (filters.not_cooked_since !== undefined) {
      if (cookedStr !== null && cookedStr >= filters.not_cooked_since) continue;
    }

    // exclude_cooked_within_days: drop if cooked on/after the cutoff. Never-cooked passes.
    if (cutoffWithin !== null && cookedStr !== null && cookedStr >= cutoffWithin) continue;

    out.push({ slug: recipe.slug, title: recipe.title, frontmatter: recipe });
  }

  return out;
}
