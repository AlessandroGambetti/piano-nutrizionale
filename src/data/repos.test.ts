import { beforeEach, describe, expect, it } from 'vitest'
import type { PastoConsumato } from '../domain/types'
import { apriDb, type Db } from './db'
import { RepoImpostazioniIdb, RepoPastiIdb, RepoPianiIdb, RepoSettimanaIdb } from './repos'
import { giornateFixture } from '../test/fixtures'

let contatore = 0
let db: Db
beforeEach(async () => {
  db = await apriDb(`test-repos-${++contatore}`)
})

function pasto(sovrascrivi: Partial<PastoConsumato> = {}): PastoConsumato {
  return {
    data: '2026-07-16',
    pasto: 'Pranzo',
    pianoId: 'p1',
    giornataOpzione: 'Giovedì',
    alimentiPrincipali: 'Alimenti di Pranzo del Giovedì',
    alternativaScelta: 'Pranzo Giovedì — piatto A',
    altroTesto: null,
    chips: ['Ok'],
    nota: null,
    timestamp: '2026-07-16T13:00:00.000Z',
    ...sovrascrivi,
  }
}

describe('RepoPianiIdb', () => {
  it('salva è idempotente sullo stesso contenuto (stesso pianoId)', async () => {
    const repo = new RepoPianiIdb(db)
    const p1 = await repo.salva(giornateFixture(), 'a.xlsx')
    const p2 = await repo.salva(giornateFixture(), 'b.xlsx')
    expect(p2.pianoId).toBe(p1.pianoId)
    expect(await repo.elenca()).toHaveLength(1)
  })

  it('attiva è esclusiva e pianoAttivo la riflette', async () => {
    const repo = new RepoPianiIdb(db)
    const g2 = giornateFixture()
    g2[0].pasti['Cena'].alimentiPrincipali = 'variante'
    const p1 = await repo.salva(giornateFixture(), 'v1.xlsx')
    const p2 = await repo.salva(g2, 'v2.xlsx')
    await repo.attiva(p1.pianoId)
    await repo.attiva(p2.pianoId)
    const attivi = (await repo.elenca()).filter((p) => p.attivo)
    expect(attivi.map((p) => p.pianoId)).toEqual([p2.pianoId])
    expect((await repo.pianoAttivo())?.pianoId).toBe(p2.pianoId)
  })

  it('attiva su id inesistente fallisce', async () => {
    const repo = new RepoPianiIdb(db)
    await expect(repo.attiva('manca')).rejects.toThrow('non trovato')
  })
})

describe('RepoPastiIdb', () => {
  it('salvaDaPiano è upsert per (data, pasto): la ri-conferma sovrascrive', async () => {
    const repo = new RepoPastiIdb(db)
    await repo.salvaDaPiano(pasto({ chips: ['Ok'] }))
    await repo.salvaDaPiano(pasto({ chips: ['Gonfiore'], timestamp: '2026-07-16T14:00:00.000Z' }))
    const registrati = await repo.perData('2026-07-16')
    expect(registrati).toHaveLength(1)
    expect(registrati[0].chips).toEqual(['Gonfiore'])
  })

  it('i fuori piano si accumulano e convivono col pasto da piano', async () => {
    const repo = new RepoPastiIdb(db)
    await repo.salvaDaPiano(pasto())
    await repo.aggiungiFuoriPiano(pasto({ fuoriPiano: true, giornataOpzione: null, timestamp: '2026-07-16T15:00:00.000Z' }))
    await repo.aggiungiFuoriPiano(pasto({ fuoriPiano: true, giornataOpzione: null, timestamp: '2026-07-16T16:00:00.000Z' }))
    expect(await repo.perData('2026-07-16')).toHaveLength(3)
  })

  it('marcaGiornataPrecedente conserva i record e libera la chiave (data, pasto)', async () => {
    const repo = new RepoPastiIdb(db)
    await repo.salvaDaPiano(pasto())
    await repo.aggiungiFuoriPiano(pasto({ fuoriPiano: true, giornataOpzione: null }))
    const marcati = await repo.marcaGiornataPrecedente('2026-07-16')
    expect(marcati).toHaveLength(1) // il fuori piano non si tocca
    expect(marcati[0].giornataPrecedente).toBe(true)

    // la nuova giornata può riconfermare lo stesso pasto senza sovrascrivere lo storico
    await repo.salvaDaPiano(pasto({ giornataOpzione: 'Lunedì', alimentiPrincipali: 'Alimenti di Pranzo del Lunedì' }))
    const tutti = await repo.perData('2026-07-16')
    expect(tutti).toHaveLength(3)
    expect(tutti.filter((r) => r.giornataPrecedente)).toHaveLength(1)
  })

  it('intervallo filtra per data', async () => {
    const repo = new RepoPastiIdb(db)
    await repo.salvaDaPiano(pasto({ data: '2026-07-14' }))
    await repo.salvaDaPiano(pasto({ data: '2026-07-16' }))
    await repo.salvaDaPiano(pasto({ data: '2026-07-20' }))
    const settimana = await repo.intervallo('2026-07-13', '2026-07-19')
    expect(settimana.map((r) => r.data)).toEqual(['2026-07-14', '2026-07-16'])
  })
})

describe('RepoSettimanaIdb e RepoImpostazioniIdb', () => {
  it('settimana: leggi/scrivi round-trip', async () => {
    const repo = new RepoSettimanaIdb(db)
    expect(await repo.leggi()).toBeNull()
    await repo.scrivi({ settimana: '2026-W29', conferme: { '2026-07-16': 'Giovedì' }, consumate: ['Giovedì'] })
    expect((await repo.leggi())?.conferme['2026-07-16']).toBe('Giovedì')
  })

  it('impostazioni: default con chip di §4 e persistenza', async () => {
    const repo = new RepoImpostazioniIdb(db)
    const def = await repo.leggi()
    expect(def.chips).toEqual(['Ok', 'Gonfiore', 'Reflusso', 'Fame', 'Poco appetito'])
    expect(def.autoLockMinuti).toBe(5)
    await repo.scrivi({ ...def, chips: [...def.chips, 'Nausea'] })
    expect((await repo.leggi()).chips).toContain('Nausea')
  })
})
