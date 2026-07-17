import { beforeEach, describe, expect, it } from 'vitest'
import { apriDb, type Db } from './db'
import { RepoPastiIdb, RepoPianiIdb, RepoSettimanaIdb } from './repos'
import { ErroreDominio, MotoreSettimanaleImpl } from './motore'
import { giornateFixture } from '../test/fixtures'
import type { PastoConsumato } from '../domain/types'

// Settimana di riferimento: 2026-W29 = lunedì 13 → domenica 19 luglio 2026.
const GIOVEDI = new Date(2026, 6, 16, 9)
const MERCOLEDI = new Date(2026, 6, 15, 9)
const LUNEDI_DOPO = new Date(2026, 6, 20, 0, 5)

let contatore = 0
let db: Db
let piani: RepoPianiIdb
let settimana: RepoSettimanaIdb
let pasti: RepoPastiIdb
let motore: MotoreSettimanaleImpl

beforeEach(async () => {
  db = await apriDb(`test-motore-${++contatore}`)
  piani = new RepoPianiIdb(db)
  settimana = new RepoSettimanaIdb(db)
  pasti = new RepoPastiIdb(db)
  motore = new MotoreSettimanaleImpl(piani, settimana, pasti, () => GIOVEDI)
  const piano = await piani.salva(giornateFixture(), 'fixture.xlsx')
  await piani.attiva(piano.pianoId)
})

describe('allinea', () => {
  it('crea lo stato al primo avvio e lo conserva nella stessa settimana', async () => {
    const stato = await motore.allinea(GIOVEDI)
    expect(stato.settimana).toBe('2026-W29')
    await motore.confermaGiornata('2026-07-16', 'Giovedì')
    const stesso = await motore.allinea(new Date(2026, 6, 17, 8)) // venerdì stessa settimana
    expect(stesso.conferme['2026-07-16']).toBe('Giovedì')
  })

  it('al cambio settimana ISO azzera pool e conferme, storico intatto (criterio §7.7)', async () => {
    await motore.allinea(GIOVEDI)
    await motore.confermaGiornata('2026-07-16', 'Giovedì')
    await pasti.salvaDaPiano(record())
    const nuovo = await motore.allinea(LUNEDI_DOPO)
    expect(nuovo.settimana).toBe('2026-W30')
    expect(nuovo.conferme).toEqual({})
    expect(nuovo.consumate).toEqual([])
    expect(await pasti.perData('2026-07-16')).toHaveLength(1) // storico conservato
  })

  it('al reset attiva il piano pendente ("Applica da lunedì prossimo")', async () => {
    const variato = giornateFixture()
    variato[0].pasti['Cena'].alimentiPrincipali = 'variante v2'
    const pianoNuovo = await piani.salva(variato, 'v2.xlsx')
    const stato = await motore.allinea(GIOVEDI)
    await settimana.scrivi({ ...stato, pianoPendenteId: pianoNuovo.pianoId })

    await motore.allinea(LUNEDI_DOPO)
    expect((await piani.pianoAttivo())?.pianoId).toBe(pianoNuovo.pianoId)
    expect((await settimana.leggi())?.pianoPendenteId).toBeUndefined()
  })
})

describe('pool', () => {
  it('esclude le giornate bloccate fuori dal giorno naturale (criterio §7.3)', async () => {
    await motore.allinea(GIOVEDI)
    const nomi = (await motore.pool('2026-07-16')).map((g) => g.giorno)
    expect(nomi).not.toContain('Mercoledì')
    expect(nomi).not.toContain('Venerdì')
    expect(nomi).not.toContain('Domenica')
    expect(nomi[0]).toBe('Giovedì') // naturale in cima, preselezione a 1 tap
  })

  it('include la giornata bloccata nel suo giorno naturale, in cima', async () => {
    await motore.allinea(MERCOLEDI)
    const nomi = (await motore.pool('2026-07-15')).map((g) => g.giorno)
    expect(nomi[0]).toBe('Mercoledì')
  })

  it('una giornata confermata esce dal pool fino al reset (criterio §7.2)', async () => {
    await motore.allinea(MERCOLEDI)
    await motore.confermaGiornata('2026-07-15', 'Martedì') // martedì usato mercoledì
    const nomiGiovedi = (await motore.pool('2026-07-16')).map((g) => g.giorno)
    expect(nomiGiovedi).not.toContain('Martedì')
    await motore.allinea(LUNEDI_DOPO)
    expect((await motore.pool('2026-07-20')).map((g) => g.giorno)).toContain('Martedì')
  })

  it('senza piano attivo il pool è vuoto', async () => {
    const dbVuoto = await apriDb(`test-motore-vuoto-${++contatore}`)
    const m = new MotoreSettimanaleImpl(
      new RepoPianiIdb(dbVuoto), new RepoSettimanaIdb(dbVuoto), new RepoPastiIdb(dbVuoto),
    )
    expect(await m.pool('2026-07-16')).toEqual([])
  })
})

describe('confermaGiornata e cambiaGiornata', () => {
  it('rifiuta giornate non disponibili (bloccata fuori giorno, già consumata)', async () => {
    await motore.allinea(GIOVEDI)
    await expect(motore.confermaGiornata('2026-07-16', 'Venerdì')).rejects.toThrow(ErroreDominio)
    await motore.confermaGiornata('2026-07-16', 'Martedì')
    await expect(motore.confermaGiornata('2026-07-17', 'Martedì')).rejects.toThrow(ErroreDominio)
  })

  it('cambio idea nello stesso giorno: la giornata precedente torna nel pool', async () => {
    await motore.allinea(GIOVEDI)
    await motore.confermaGiornata('2026-07-16', 'Martedì')
    await motore.confermaGiornata('2026-07-16', 'Giovedì')
    const stato = await settimana.leggi()
    expect(stato?.conferme['2026-07-16']).toBe('Giovedì')
    expect(stato?.consumate).toEqual(['Giovedì'])
    expect((await motore.pool('2026-07-17')).map((g) => g.giorno)).toContain('Martedì')
  })

  it('cambiaGiornata marca giornata_precedente e riparte non consumata (criterio §7.9)', async () => {
    await motore.allinea(GIOVEDI)
    await motore.confermaGiornata('2026-07-16', 'Giovedì')
    await pasti.salvaDaPiano(record({ pasto: 'Colazione' }))
    await pasti.salvaDaPiano(record({ pasto: 'Pranzo' }))

    await motore.cambiaGiornata('2026-07-16', 'Lunedì')

    const registrati = await pasti.perData('2026-07-16')
    expect(registrati.filter((r) => r.giornataPrecedente)).toHaveLength(2)
    const stato = await settimana.leggi()
    expect(stato?.conferme['2026-07-16']).toBe('Lunedì')
    expect(stato?.consumate).toEqual(['Lunedì'])
  })
})

describe('resetManuale', () => {
  it('azzera conferme e consumate conservando il piano pendente', async () => {
    await motore.allinea(GIOVEDI)
    await motore.confermaGiornata('2026-07-16', 'Giovedì')
    const stato = await settimana.leggi()
    await settimana.scrivi({ ...stato!, pianoPendenteId: 'pendente-x' })

    await motore.resetManuale()
    const dopo = await settimana.leggi()
    expect(dopo?.conferme).toEqual({})
    expect(dopo?.consumate).toEqual([])
    expect(dopo?.pianoPendenteId).toBe('pendente-x')
  })
})

function record(sovrascrivi: Partial<PastoConsumato> = {}): PastoConsumato {
  return {
    data: '2026-07-16',
    pasto: 'Pranzo',
    pianoId: 'p1',
    giornataOpzione: 'Giovedì',
    alimentiPrincipali: 'Alimenti di Pranzo del Giovedì',
    alternativaScelta: null,
    altroTesto: null,
    chips: [],
    nota: null,
    timestamp: `2026-07-16T12:00:00.000Z`,
    ...sovrascrivi,
  }
}
