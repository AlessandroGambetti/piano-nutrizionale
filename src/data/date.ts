import { GIORNI, type DataLocale, type Giorno, type SettimanaISO } from '../domain/types'

/** 'YYYY-MM-DD' in ora locale — MAI toISOString() (§ contratto DateUtils). */
export function dataLocale(d: Date): DataLocale {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${g}`
}

/** Settimana ISO 8601 'YYYY-Www', calcolata interamente in ora locale. */
export function settimanaISO(d: Date): SettimanaISO {
  // Il giovedì della settimana determina anno e numero ISO.
  const giovedi = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  giovedi.setDate(giovedi.getDate() + 3 - ((giovedi.getDay() + 6) % 7))
  const anno = giovedi.getFullYear()
  const gen4 = new Date(anno, 0, 4)
  const primoGiovedi = new Date(anno, 0, 4 - ((gen4.getDay() + 6) % 7) + 3)
  // round assorbe l'ora di sbandamento dei cambi DST
  const numero = 1 + Math.round((giovedi.getTime() - primoGiovedi.getTime()) / (7 * 86400000))
  return `${anno}-W${String(numero).padStart(2, '0')}`
}

export function giornoNaturale(d: Date): Giorno {
  return GIORNI[(d.getDay() + 6) % 7]
}

/** Da 'YYYY-MM-DD' a Date locale (mezzogiorno, per stare lontani dai bordi DST). */
export function daDataLocale(data: DataLocale): Date {
  const [a, m, g] = data.split('-').map(Number)
  return new Date(a, m - 1, g, 12)
}
