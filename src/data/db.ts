import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Impostazioni, PastoConsumato, Piano, StatoSettimana } from '../domain/types'

export interface SchemaDb extends DBSchema {
  piani: { key: string; value: Piano }
  settimana: { key: string; value: StatoSettimana }
  // chiavi out-of-line: 'data|pasto' (da piano), 'data|pasto|prev|ts', 'data|pasto|fp|ts'
  pasti_consumati: { key: string; value: PastoConsumato }
  impostazioni: { key: string; value: Impostazioni }
}

export type Db = IDBPDatabase<SchemaDb>

export const NOME_DB = 'piano-nutrizionale'

export async function apriDb(nome: string = NOME_DB): Promise<Db> {
  return openDB<SchemaDb>(nome, 1, {
    upgrade(db) {
      db.createObjectStore('piani', { keyPath: 'pianoId' })
      db.createObjectStore('settimana')
      db.createObjectStore('pasti_consumati')
      db.createObjectStore('impostazioni')
    },
  })
}

/** Dump completo per il backup JSON: conserva le chiavi di pasti_consumati. */
export interface DumpDb {
  versione: 1
  esportatoIl: string
  piani: Piano[]
  settimana: StatoSettimana | null
  pasti: Array<{ chiave: string; record: PastoConsumato }>
  impostazioni: Impostazioni | null
}

export async function dumpDb(db: Db): Promise<DumpDb> {
  const [piani, settimana, chiaviPasti, valoriPasti, impostazioni] = await Promise.all([
    db.getAll('piani'),
    db.get('settimana', 'corrente'),
    db.getAllKeys('pasti_consumati'),
    db.getAll('pasti_consumati'),
    db.get('impostazioni', 'app'),
  ])
  return {
    versione: 1,
    esportatoIl: new Date().toISOString(),
    piani,
    settimana: settimana ?? null,
    pasti: chiaviPasti.map((chiave, i) => ({ chiave, record: valoriPasti[i] })),
    impostazioni: impostazioni ?? null,
  }
}

export async function ripristinaDb(db: Db, dump: DumpDb): Promise<void> {
  const tx = db.transaction(['piani', 'settimana', 'pasti_consumati', 'impostazioni'], 'readwrite')
  await Promise.all([
    tx.objectStore('piani').clear(),
    tx.objectStore('settimana').clear(),
    tx.objectStore('pasti_consumati').clear(),
    tx.objectStore('impostazioni').clear(),
  ])
  for (const p of dump.piani) await tx.objectStore('piani').put(p)
  if (dump.settimana) await tx.objectStore('settimana').put(dump.settimana, 'corrente')
  for (const { chiave, record } of dump.pasti) await tx.objectStore('pasti_consumati').put(record, chiave)
  if (dump.impostazioni) await tx.objectStore('impostazioni').put(dump.impostazioni, 'app')
  await tx.done
}
