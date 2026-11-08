import type { Country, Locale } from "./types";

/** Lowercase, accent-insensitive, punctuation-insensitive normal form used for all searches. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´.]/g, "")
    .replace(/[-_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexEntry {
  country: Country;
  names: string[]; // primary names (both languages)
  aliases: string[];
}

export function buildSearchIndex(countries: readonly Country[]): IndexEntry[] {
  return countries.map((country) => ({
    country,
    names: [normalizeText(country.name.fr), normalizeText(country.name.en)],
    aliases: [...(country.aliases?.fr ?? []), ...(country.aliases?.en ?? [])].map(normalizeText).filter(Boolean),
  }));
}

/**
 * Searches French and English names + aliases regardless of UI language.
 * Ranking: exact > prefix of a name > prefix of a word / alias > substring.
 */
export function searchCountries(
  index: readonly IndexEntry[],
  query: string,
  allowed: ReadonlySet<string> | null,
  locale: Locale,
  limit = 8,
): Country[] {
  const q = normalizeText(query);
  const scored: { c: Country; score: number; label: string }[] = [];
  for (const e of index) {
    if (allowed && !allowed.has(e.country.id)) continue;
    const label = normalizeText(e.country.name[locale]);
    if (q === "") {
      scored.push({ c: e.country, score: 5, label });
      continue;
    }
    let best = -1;
    for (const n of e.names) {
      if (n === q) best = Math.max(best, 100);
      else if (n.startsWith(q)) best = Math.max(best, 80);
      else if (n.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 60);
      else if (n.includes(q)) best = Math.max(best, 30);
    }
    for (const a of e.aliases) {
      if (a === q) best = Math.max(best, 90);
      else if (a.startsWith(q)) best = Math.max(best, 55);
      else if (q.length >= 3 && a.includes(q)) best = Math.max(best, 20);
    }
    if (best >= 0) scored.push({ c: e.country, score: best, label });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, locale));
  return scored.slice(0, limit).map((s) => s.c);
}

/** Resolves free text to a single country when unambiguous (exact name/alias match or sole result). */
export function resolveCountry(
  index: readonly IndexEntry[],
  query: string,
  allowed: ReadonlySet<string> | null,
  locale: Locale,
): Country | null {
  const q = normalizeText(query);
  if (!q) return null;
  for (const e of index) {
    if (allowed && !allowed.has(e.country.id)) continue;
    if (e.names.includes(q) || e.aliases.includes(q)) return e.country;
  }
  const res = searchCountries(index, query, allowed, locale, 2);
  return res.length === 1 ? res[0] : null;
}
