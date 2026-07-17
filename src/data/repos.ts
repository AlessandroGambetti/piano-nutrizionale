import type {
  DataLocale,
  GiornataPiano,
  Impostazioni,
  PastoConsumato,
  Piano,
  StatoSettimana,
} from '../domain/types'
import { AUTO_LOCK_DEFAULT_MINUTI, CHIPS_DEFAULT } from '../domain/types'
import type { RepoImpostazioni, RepoPasti, RepoPiani, RepoSettimana } from '../domain/ports'
import type { Db } from './db'

async function sha256(testo: string): Promise<string> {
  const dati = new TextEncoder().encode(testo)
  const hash = await crypto.subtle.digest('SHA-256', dati)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

export class RepoPianiIdb implements RepoPiani {
  private db: Db
  constructor(db: Db) {
    this.db = db
  }

  async salva(giornate: GiornataPiano[], nomeFile: string): Promise<Piano> {
    const pianoId = await sha256(JSON.stringify(giornate))
    const esistente = await this.db.get('piani', pianoId)
    if (esistente) return esistente
    const piano: Piano = {
      pianoId,
      caricatoIl: new Date().toISOString(),
      attivo: false,
      nomeFile,
      giornate,
    }
    await this.db.put('piani', piano)
    return piano
  }

  async attiva(pianoId: string): Promise<void> {
    const tx = this.db.transaction('piani', 'readwrite')
    let trovato = false
    for (const p of await tx.store.getAll()) {
      const attivo = p.pianoId === pianoId
      trovato = trovato || attivo
      if (p.attivo !== attivo) await tx.store.put({ ...p, attivo })
    }
    await tx.done
    if (!trovato) throw new Error(`Piano non trovato: ${pianoId}`)
  }

  async pianoAttivo(): Promise<Piano | null> {
    return (await this.db.getAll('piani')).find((p) => p.attivo) ?? null
  }

  async perId(pianoId: string): Promise<Piano | null> {
    return (await this.db.get('piani', pianoId)) ?? null
  }

  async elenca(): Promise<Piano[]> {
    return (await this.db.getAll('piani')).sort((a, b) => b.caricatoIl.localeCompare(a.caricatoIl))
  }
}

export class RepoSettimanaIdb implements RepoSettimana {
  private db: Db
  constructor(db: Db) {
    this.db = db
  }
  async leggi(): Promise<StatoSettimana | null> {
    return (await this.db.get('settimana', 'corrente')) ?? null
  }
  async scrivi(stato: StatoSettimana): Promise<void> {
    await this.db.put('settimana', stato, 'corrente')
  }
}

export class RepoPastiIdb implements RepoPasti {
  private db: Db
  constructor(db: Db) {
    this.db = db
  }

  private static intervalloChiavi(data: DataLocale): IDBKeyRange {
    return IDBKeyRange.bound(data, data + '￿')
  }

  async salvaDaPiano(record: PastoConsumato): Promise<void> {
    await this.db.put('pasti_consumati', record, `${record.data}|${record.pasto}`)
  }

  async aggiungiFuoriPiano(record: PastoConsumato): Promise<void> {
    await this.db.put('pasti_consumati', record, `${record.data}|${record.pasto}|fp|${record.timestamp}`)
  }

  async perData(data: DataLocale): Promise<PastoConsumato[]> {
    return this.db.getAll('pasti_consumati', RepoPastiIdb.intervalloChiavi(data))
  }

  async intervallo(da: DataLocale, a: DataLocale): Promise<PastoConsumato[]> {
    return this.db.getAll('pasti_consumati', IDBKeyRange.bound(da, a + '￿'))
  }

  async tutti(): Promise<PastoConsumato[]> {
    return this.db.getAll('pasti_consumati')
  }

  async marcaGiornataPrecedente(data: DataLocale): Promise<PastoConsumato[]> {
    // I record da piano vengono spostati su una chiave storica: la (data, pasto)
    // resta libera per le conferme della nuova giornata.
    const marcati: PastoConsumato[] = []
    const tx = this.db.transaction('pasti_consumati', 'readwrite')
    let cursore = await tx.store.openCursor(RepoPastiIdb.intervalloChiavi(data))
    while (cursore) {
      const record = cursore.value
      if (!record.fuoriPiano && !record.giornataPrecedente) {
        const storicizzato: PastoConsumato = { ...record, giornataPrecedente: true }
        await cursore.delete()
        await tx.store.put(storicizzato, `${record.data}|${record.pasto}|prev|${record.timestamp}`)
        marcati.push(storicizzato)
      }
      cursore = await cursore.continue()
    }
    await tx.done
    return marcati
  }
}

export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  chips: [...CHIPS_DEFAULT],
  bloccoAttivo: false,
  pinHash: null,
  autoLockMinuti: AUTO_LOCK_DEFAULT_MINUTI,
  ultimoBackup: null,
}

export class RepoImpostazioniIdb implements RepoImpostazioni {
  private db: Db
  constructor(db: Db) {
    this.db = db
  }
  async leggi(): Promise<Impostazioni> {
    return (await this.db.get('impostazioni', 'app')) ?? { ...IMPOSTAZIONI_DEFAULT }
  }
  async scrivi(impostazioni: Impostazioni): Promise<void> {
    await this.db.put('impostazioni', impostazioni, 'app')
  }
}
