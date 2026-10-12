// UI-17 library browsers: search and filters over any library index.

export interface LibraryItem {
  id: string;
  name: string;
  /** facet name -> value, e.g. {interface: "I²C", status: "active"} */
  facets: Record<string, string>;
  text?: string;
}

export function facetValues(items: LibraryItem[], facet: string): string[] {
  return [...new Set(items.map((i) => i.facets[facet]).filter((v): v is string => !!v))].sort();
}

export function filterItems(items: LibraryItem[], query: string, facets: Record<string, string>): LibraryItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((i) => Object.entries(facets).every(([k, v]) => !v || i.facets[k] === v))
    .filter((i) => {
      const hay = `${i.id} ${i.name} ${Object.values(i.facets).join(' ')} ${i.text ?? ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Other library tabs that match a query which finds nothing in the current one (usability
 * finding U-1): [tab id, number of matches], in tab order. */
export function matchesElsewhere(seed: Record<string, LibraryItem[]>, tabs: string[], current: string, query: string): [string, number][] {
  if (!query.trim()) return [];
  return tabs
    .filter((t) => t !== current)
    .map((t): [string, number] => [t, filterItems(seed[t] ?? [], query, {}).length])
    .filter(([, n]) => n > 0);
}
