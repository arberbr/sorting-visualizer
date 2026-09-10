/**
 * Pulls just the sort function out of an algorithm module's raw text, so the
 * code panel shows the algorithm rather than its imports and metadata.
 * Every impl file must declare `export function sort` last.
 */
export function extractSortSource(raw: string): string {
  const marker = raw.indexOf('export function sort')
  if (marker === -1) return raw.trim()
  return raw.slice(marker + 'export '.length).trim()
}
