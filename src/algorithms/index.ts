import type { AlgorithmMeta, Family, SortFn } from '../core/types'
import { FAMILY_LABELS, FAMILY_ORDER } from './families'
import { extractSortSource } from './source'

export interface Algorithm {
  meta: AlgorithmMeta
  sort: SortFn
  /** The sort function's own text, shown in the code panel. */
  source: string
}

type Module = { meta: AlgorithmMeta; sort: SortFn }

const modules = import.meta.glob<Module>('./impl/*.ts', { eager: true })
const sources = import.meta.glob<string>('./impl/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const all: Algorithm[] = Object.entries(modules).map(([path, mod]) => {
  if (!mod.meta || typeof mod.sort !== 'function') {
    throw new Error(`${path} must export both meta and sort`)
  }
  return { meta: mod.meta, sort: mod.sort, source: extractSortSource(sources[path] ?? '') }
})

all.sort((a, b) => {
  const fam = FAMILY_ORDER.indexOf(a.meta.family) - FAMILY_ORDER.indexOf(b.meta.family)
  return fam !== 0 ? fam : a.meta.name.localeCompare(b.meta.name)
})

export const ALGORITHMS: readonly Algorithm[] = all

const byId = new Map(all.map((a) => [a.meta.id, a]))

export function getAlgorithm(id: string): Algorithm | undefined {
  return byId.get(id)
}

export function algorithmsByFamily(): ReadonlyArray<{
  family: Family
  label: string
  items: readonly Algorithm[]
}> {
  return FAMILY_ORDER.map((family) => ({
    family,
    label: FAMILY_LABELS[family],
    items: all.filter((a) => a.meta.family === family),
  })).filter((g) => g.items.length > 0)
}

export { FAMILY_LABELS, FAMILY_ORDER }
