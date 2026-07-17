import { describe, expect, it } from 'vitest'
import { ParserPianoXlsx } from './parser'
import { righeTemplateValide, xlsxDaRighe } from '../test/fixtures'

const parser = new ParserPianoXlsx()

describe('ParserPianoXlsx — file valido', () => {
  it('accetta il template completo e ricostruisce le 7 giornate in ordine', () => {
    const esito = parser.parse(xlsxDaRighe(righeTemplateValide()))
    if (!esito.ok) throw new Error(JSON.stringify(esito.errori))
    expect(esito.giornate.map((g) => g.giorno)).toEqual([
      'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica',
    ])
    expect(esito.giornate.filter((g) => g.bloccataAlGiorno).map((g) => g.giorno)).toEqual([
      'Mercoledì', 'Venerdì', 'Domenica',
    ])
    expect(esito.giornate[0].pasti['Pranzo'].alimentiPrincipali).toBe('Alimenti di Pranzo del Lunedì')
    expect(esito.giornate[0].pasti['Cena'].alternative).toHaveLength(3)
    expect(esito.avvisi).toEqual([])
  })

  it('ammette alternative vuote (es. "Niente" della domenica)', () => {
    const righe = righeTemplateValide()
    const domenicaSpuntino = righe.find((r) => r[0] === 'Domenica' && r[1] === 'Spuntino pomeriggio')!
    domenicaSpuntino[2] = 'Niente'
    domenicaSpuntino[3] = domenicaSpuntino[4] = domenicaSpuntino[5] = ''
    const esito = parser.parse(xlsxDaRighe(righe))
    if (!esito.ok) throw new Error(JSON.stringify(esito.errori))
    expect(esito.giornate[6].pasti['Spuntino pomeriggio'].alternative).toEqual([])
  })

  it('accetta SI/si/Sì e ignora righe completamente vuote in coda', () => {
    const righe = [...righeTemplateValide(), ['', '', '', '', '', '', '']]
    righe.find((r) => r[0] === 'Mercoledì' && r[1] === 'Pranzo')![6] = 'sì'
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(true)
  })
})

describe('ParserPianoXlsx — validazione', () => {
  it('rifiuta un file senza foglio PIANO', () => {
    const esito = parser.parse(xlsxDaRighe(righeTemplateValide(), 'Foglio1'))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori[0].messaggio).toContain('PIANO')
  })

  it('rifiuta intestazioni sbagliate', () => {
    const righe = righeTemplateValide()
    righe[0][2] = 'Alimenti'
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori[0].campo).toBe('AlimentiPrincipali')
  })

  it('segnala la riga mancante per giorno/pasto', () => {
    const righe = righeTemplateValide().filter((r) => !(r[0] === 'Martedì' && r[1] === 'Cena'))
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori.some((e) => e.messaggio.includes('Martedì / Cena'))).toBe(true)
  })

  it('rifiuta AlimentiPrincipali vuoto', () => {
    const righe = righeTemplateValide()
    righe.find((r) => r[0] === 'Sabato' && r[1] === 'Pranzo')![2] = ''
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori.some((e) => e.campo === 'AlimentiPrincipali')).toBe(true)
  })

  it('rifiuta valori BloccatoAlGiorno fuori da SI/NO', () => {
    const righe = righeTemplateValide()
    righe.find((r) => r[0] === 'Lunedì' && r[1] === 'Cena')![6] = 'FORSE'
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori.some((e) => e.campo === 'BloccatoAlGiorno')).toBe(true)
  })

  it('rifiuta combinazioni duplicate', () => {
    const righe = righeTemplateValide()
    righe.push(righe[1].slice())
    const esito = parser.parse(xlsxDaRighe(righe))
    expect(esito.ok).toBe(false)
    if (!esito.ok) expect(esito.errori.some((e) => e.messaggio.includes('duplicata'))).toBe(true)
  })

  it('blocco incoerente nella giornata: avviso e giornata bloccata (§2)', () => {
    const righe = righeTemplateValide()
    righe.find((r) => r[0] === 'Lunedì' && r[1] === 'Cena')![6] = 'SI'
    const esito = parser.parse(xlsxDaRighe(righe))
    if (!esito.ok) throw new Error(JSON.stringify(esito.errori))
    expect(esito.avvisi.some((a) => a.includes('Lunedì') && a.includes('incoerente'))).toBe(true)
    expect(esito.giornate[0].bloccataAlGiorno).toBe(true)
  })

  it('rifiuta contenuto che non è un xlsx', () => {
    const esito = parser.parse(new TextEncoder().encode('non sono un xlsx').buffer as ArrayBuffer)
    expect(esito.ok).toBe(false)
  })
})
