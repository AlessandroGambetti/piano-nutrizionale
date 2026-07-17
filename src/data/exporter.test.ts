import { beforeEach, describe, expect, it } from 'vitest'
import type { PastoConsumato } from '../domain/types'
import { apriDb, type Db } from './db'
import { RepoImpostazioniIdb, RepoPastiIdb, RepoPianiIdb, RepoSettimanaIdb } from './repos'
import { ExporterImpl } from './exporter'
import { giornateFixture } from '../test/fixtures'

let contatore = 0
let db: Db
let exporter: ExporterImpl
let impostazioni: RepoImpostazioniIdb

beforeEach(async () => {
  db = await apriDb(`test-exporter-${++contatore}`)
  impostazioni = new RepoImpostazioniIdb(db)
  exporter = new ExporterImpl(db, impostazioni)
})

const record: PastoConsumato = {
  data: '2026-07-16',
  pasto: 'Pranzo',
  pianoId: 'p1',
  giornataOpzione: 'Giovedì',
  alimentiPrincipali: 'Pasta però con "sughetto"; e verdure',
  alternativaScelta: 'Pranzo Giovedì — piatto A',
  altroTesto: null,
  chips: ['Ok', 'Gonfiore'],
  nota: 'un po\' più sazio del solito',
  timestamp: '2026-07-16T13:00:00.000Z',
}

describe('csvStorico', () => {
  it('BOM UTF-8, separatore ; e caratteri italiani intatti (criterio §7.6)', async () => {
    const blob = exporter.csvStorico([record])
    // .text() decodifica rimuovendo il BOM per specifica: si verificano i byte grezzi
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const testo = await blob.text()
    expect(testo).toContain('Data;Pasto;GiornataOpzione;Alternativa;Altro;Chip;Nota;FuoriPiano')
    expect(testo).toContain('Giovedì')
    expect(testo).toContain('più sazio')
  })

  it('quota i campi con ; o virgolette e i chip danno segnale anche senza nota (criterio §7.16)', async () => {
    const conNotaInsidiosa: PastoConsumato = { ...record, nota: 'pasta però con "sughetto"; e verdure' }
    const senzaNota: PastoConsumato = { ...record, nota: null, alternativaScelta: null, altroTesto: null }
    const testo = await exporter.csvStorico([conNotaInsidiosa, senzaNota]).text()
    expect(testo).toContain('"pasta però con ""sughetto""; e verdure"')
    const righe = testo.trim().split('\r\n')
    expect(righe[2]).toContain('Ok + Gonfiore') // chip presenti a nota vuota
    expect(righe[2].endsWith(';NO')).toBe(true)
  })

  it('marca i fuori piano', async () => {
    const fp: PastoConsumato = { ...record, fuoriPiano: true, giornataOpzione: null, altroTesto: 'pizza con i colleghi' }
    const testo = await exporter.csvStorico([fp]).text()
    expect(testo).toContain('pizza con i colleghi')
    expect(testo.trim().split('\r\n')[1].endsWith(';SI')).toBe(true)
  })
})

describe('backup e ripristino', () => {
  it('round-trip completo: piani + settimana + storico + impostazioni (chiavi conservate)', async () => {
    const piani = new RepoPianiIdb(db)
    const settimana = new RepoSettimanaIdb(db)
    const pasti = new RepoPastiIdb(db)
    const piano = await piani.salva(giornateFixture(), 'fixture.xlsx')
    await piani.attiva(piano.pianoId)
    await settimana.scrivi({ settimana: '2026-W29', conferme: { '2026-07-16': 'Giovedì' }, consumate: ['Giovedì'] })
    await pasti.salvaDaPiano(record)
    await pasti.aggiungiFuoriPiano({ ...record, fuoriPiano: true, giornataOpzione: null })

    const json = await (await exporter.backupCompleto()).text()
    expect((await impostazioni.leggi()).ultimoBackup).not.toBeNull()

    // ripristino su un database nuovo (scenario: reinstallazione dopo evacuazione iOS)
    const db2 = await apriDb(`test-exporter-restore-${contatore}`)
    const exporter2 = new ExporterImpl(db2, new RepoImpostazioniIdb(db2))
    await exporter2.ripristinaBackup(json)

    const pasti2 = new RepoPastiIdb(db2)
    expect(await pasti2.perData('2026-07-16')).toHaveLength(2)
    expect((await new RepoPianiIdb(db2).pianoAttivo())?.pianoId).toBe(piano.pianoId)
    expect((await new RepoSettimanaIdb(db2).leggi())?.consumate).toEqual(['Giovedì'])

    // dopo il ripristino la ri-conferma resta un upsert: la chiave (data,pasto) è stata conservata
    await pasti2.salvaDaPiano({ ...record, chips: ['Reflusso'] })
    expect(await pasti2.perData('2026-07-16')).toHaveLength(2)
  })

  it('rifiuta JSON invalido o formato sconosciuto senza toccare i dati', async () => {
    await expect(exporter.ripristinaBackup('{{{')).rejects.toThrow('JSON non valido')
    await expect(exporter.ripristinaBackup('{"versione":2}')).rejects.toThrow('non supportati')
  })
})
