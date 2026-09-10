import type { Family } from '../core/types'

export const FAMILY_ORDER: readonly Family[] = [
  'exchange',
  'insertion',
  'selection',
  'divide-and-conquer',
  'non-comparison',
  'network',
  'curiosity',
]

export const FAMILY_LABELS: Record<Family, string> = {
  exchange: 'Exchange',
  insertion: 'Insertion',
  selection: 'Selection',
  'divide-and-conquer': 'Divide & conquer',
  'non-comparison': 'Non-comparison',
  network: 'Networks & trees',
  curiosity: 'Curiosities',
}
