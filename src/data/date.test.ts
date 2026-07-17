import { describe, expect, it } from 'vitest'
import { daDataLocale, dataLocale, giornoNaturale, settimanaISO } from './date'

describe('dataLocale', () => {
  it('usa la data di calendario locale, non UTC (criterio §7.10)', () => {
    // 00:30 ora locale: toISOString() darebbe il giorno prima per fusi > UTC
    const mezzanotteEMezza = new Date(2026, 6, 16, 0, 30)
    expect(dataLocale(mezzanotteEMezza)).toBe('2026-07-16')
  })

  it('azzeropadda mese e giorno', () => {
    expect(dataLocale(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('settimanaISO', () => {
  it('calcola la settimana corrente', () => {
    expect(settimanaISO(new Date(2026, 6, 16))).toBe('2026-W29') // giovedì
    expect(settimanaISO(new Date(2026, 6, 13))).toBe('2026-W29') // lunedì
    expect(settimanaISO(new Date(2026, 6, 19))).toBe('2026-W29') // domenica
    expect(settimanaISO(new Date(2026, 6, 20))).toBe('2026-W30') // lunedì dopo
  })

  it('gestisce i bordi anno secondo ISO 8601', () => {
    expect(settimanaISO(new Date(2025, 11, 28))).toBe('2025-W52') // domenica
    expect(settimanaISO(new Date(2025, 11, 29))).toBe('2026-W01') // lunedì → anno ISO nuovo
    expect(settimanaISO(new Date(2026, 0, 1))).toBe('2026-W01')
    expect(settimanaISO(new Date(2026, 11, 31))).toBe('2026-W53') // anno lungo
    expect(settimanaISO(new Date(2027, 0, 1))).toBe('2026-W53') // venerdì → ancora anno ISO 2026
    expect(settimanaISO(new Date(2027, 0, 4))).toBe('2027-W01')
  })
})

describe('giornoNaturale', () => {
  it('mappa getDay() sui nomi italiani con lunedì primo', () => {
    expect(giornoNaturale(new Date(2026, 6, 13))).toBe('Lunedì')
    expect(giornoNaturale(new Date(2026, 6, 16))).toBe('Giovedì')
    expect(giornoNaturale(new Date(2026, 6, 19))).toBe('Domenica')
  })
})

describe('daDataLocale', () => {
  it('è inversa di dataLocale', () => {
    expect(dataLocale(daDataLocale('2026-07-16'))).toBe('2026-07-16')
    expect(giornoNaturale(daDataLocale('2026-07-16'))).toBe('Giovedì')
  })
})
