import type { Family, Outcome } from '@shared/types'

/** 0.222 -> "22.2%". Null stays visibly null; it is never shown as zero. */
export const pct = (f: number | null, digits = 1) =>
  f === null ? '-' : `${(f * 100).toFixed(digits)}%`

const PSI_PER_ATM = 14.696

export const atm = (p: number | null) =>
  p === null ? '-' : `${p.toFixed(2)} atm`

export const psi = (p: number) => `${(p * PSI_PER_ATM).toFixed(1)} psi`

export const OUTCOME_LABEL: Record<Outcome, string> = {
  extinction: 'Extinguished',
  sustained: 'Kept burning',
  disruption: 'Disrupted',
  unknown: 'Not recorded',
}

export const FAMILY_LABEL: Record<Family, string> = {
  'flame-spread': 'Solid flame spread',
  droplet: 'Liquid droplet',
  burner: 'Gas burner',
  aerosol: 'Smoke aerosol',
}

export const FAMILY_ORDER: Family[] = ['flame-spread', 'droplet', 'burner', 'aerosol']

export const plural = (n: number, word: string) =>
  `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
