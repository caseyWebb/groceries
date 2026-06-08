#!/usr/bin/env node
// import-recime.mjs — one-shot importer for a ReciMe HTML export.
//
// Source: the "ReciMe Recipe Exporter" Chrome extension
//   https://chromewebstore.google.com/detail/recime-recipe-exporter/nbmmcjlploegpicloeoknlgdblcbmoga
// The export carries title / servings / prep / cook / ingredients / instructions
// per card, grouped into cookbook <section>s. It has NO source URLs and none of
// the schema's judgment fields — those are filled by later enrichment passes.
//
// This script is deterministic and DELIBERATELY non-destructive: it refuses to
// overwrite an existing recipe file, so re-running after enrichment never clobbers
// judgment fields, recovered sources, or body edits. Titles/slugs are left raw here
// (trailing " Recipe" trimmed only for slug-dedup) and cleaned in the naming pass.
//
// Usage:
//   node scripts/import-recime.mjs [export.html] [outDir]
//   node scripts/import-recime.mjs recime-export.html recipes

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import matter from 'gray-matter';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT = path.resolve(REPO_ROOT, process.argv[2] ?? 'recime-export.html');
const OUT_DIR = path.resolve(REPO_ROOT, process.argv[3] ?? 'recipes');

// --- tiny HTML helpers ---------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
function decode(s) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}
const stripTags = (s) => decode(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
function listItems(html) {
  return [...html.matchAll(/<li>(.*?)<\/li>/gs)].map((m) => stripTags(m[1])).filter(Boolean);
}

// Raw-but-safe slug: trailing " Recipe" trimmed (dedup parity), lowercased,
// non-alphanumerics collapsed to single hyphens. Cleaned further in pass 2.
function rawSlug(title) {
  return title
    .replace(/\s+Recipe$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// --- parse ---------------------------------------------------------------

const html = await readFile(EXPORT, 'utf8');

// Split into cookbook sections; each section id is the cookbook name.
const sectionRe = /<div class="cbs" id="([^"]+)">(.*?)(?=<div class="cbs" id="|<\/body>|$)/gs;
const cardRe = /<div class="rc">(.*?)(?=<div class="rc">|$)/gs;

// slug -> { title, servings, time_active, time_total, ingredients, steps, sections:Set }
const recipes = new Map();
let totalCards = 0;
let droppedNonRecipe = 0;

for (const [, section, sectionBody] of html.matchAll(sectionRe)) {
  for (const [, card] of sectionBody.matchAll(cardRe)) {
    totalCards++;
    const title = decode((card.match(/<h3>(.*?)<\/h3>/s)?.[1] ?? '').trim());
    const meta = card.match(/<div class="m">(.*?)<\/div>/s)?.[1] ?? '';
    const ingHtml = card.match(/Ingredients<\/h4><ul>(.*?)<\/ul>/s)?.[1] ?? '';
    const insHtml = card.match(/Instructions<\/h4><ol>(.*?)<\/ol>/s)?.[1] ?? '';
    const ingredients = listItems(ingHtml);
    const steps = listItems(insHtml);

    // Drop non-recipe cards (e.g. the exporter's landing card): no content at all.
    if (ingredients.length === 0 && steps.length === 0) {
      droppedNonRecipe++;
      continue;
    }

    const num = (re) => {
      const m = meta.match(re);
      return m ? Number(m[1]) : null;
    };
    const prep = num(/Prep:\s*(\d+)/);
    const cook = num(/Cook:\s*(\d+)/);
    const servings = num(/Servings:\s*(\d+)/);
    const timeActive = prep; // null if absent
    const timeTotal =
      prep == null && cook == null ? null : (prep ?? 0) + (cook ?? 0); // sum of present; null if neither

    const slug = rawSlug(title);
    const existing = recipes.get(slug);
    if (existing) {
      // Same recipe filed in another cookbook: merge the section tag, keep first content.
      if (section !== 'uncategorized') existing.sections.add(section);
      continue;
    }
    recipes.set(slug, {
      title,
      servings,
      timeActive,
      timeTotal,
      ingredients,
      steps,
      sections: new Set(section === 'uncategorized' ? [] : [section]),
    });
  }
}

// --- emit ----------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });
const existingFiles = new Set(
  (await readdir(OUT_DIR).catch(() => [])).filter((f) => f.endsWith('.md'))
);

let written = 0;
let skipped = 0;
for (const [slug, r] of recipes) {
  const file = `${slug}.md`;
  if (existingFiles.has(file)) {
    skipped++;
    console.warn(`skip (exists): ${file}`);
    continue;
  }

  const body =
    `## Ingredients\n\n` +
    r.ingredients.map((i) => `- ${i}`).join('\n') +
    `\n\n## Instructions\n\n` +
    r.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') +
    `\n`;

  // Field order mirrors docs/SCHEMAS.md. Judgment fields are unset (null / []) for
  // the enrichment pass; deterministic fields are populated from the export.
  const data = {
    title: r.title,
    tags: [...r.sections],
    protein: null,
    cuisine: null,
    style: null,
    time_total: r.timeTotal,
    time_active: r.timeActive,
    servings: r.servings,
    difficulty: null,
    dietary: [],
    season: [],
    veg_forward: null,
    last_cooked: null,
    rating: null,
    status: 'active',
    discovered_at: null,
    discovery_source: null,
    ingredients_key: [],
    meal_preppable: null,
    uses_components: [],
    produces_components: [],
    source: null,
  };

  await writeFile(path.join(OUT_DIR, file), matter.stringify(body, data));
  written++;
}

console.log(
  `\n${totalCards} cards → ${recipes.size} unique recipes ` +
    `(dropped ${droppedNonRecipe} non-recipe).\n` +
    `wrote ${written}, skipped ${skipped} existing.`
);
