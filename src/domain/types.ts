// Contratto dati (§2 del prompt) — unico punto di accoppiamento tra data layer e UI.
// Ogni modifica a questo file va valutata sull'intero sistema, non nel singolo modulo.

export const GIORNI = [
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
  'Domenica',
] as const
export type Giorno = (typeof GIORNI)[number]

export const PASTI = [
  'Colazione',
  'Spuntino mattina',
  'Pranzo',
  'Spuntino pomeriggio',
  'Cena',
] as const
export type Pasto = (typeof PASTI)[number]

/**
 * Data di calendario locale 'YYYY-MM-DD', costruita da getFullYear/getMonth/getDate.
 * MAI derivata da toISOString(): tra mezzanotte e le 2 ora italiana finirebbe sul giorno prima.
 */
export type DataLocale = string

/** Settimana ISO 8601 nel formato 'YYYY-Www' (es. '2026-W29'). */
export type SettimanaISO = string

/** Una cella del piano: cosa prevede la nutrizionista per giorno×pasto. */
export interface VocePiano {
  giorno: Giorno
  pasto: Pasto
  /** Fonte di verità: indicazioni della nutrizionista, sempre sopra le alternative. */
  alimentiPrincipali: string
  /** 0–3 proposte di piatti concreti (non prescrizioni). Vuote ammesse (es. "Niente"). */
  alternative: string[]
}

export interface GiornataPiano {
  giorno: Giorno
  /** Se true la giornata è selezionabile solo nel suo giorno naturale e non entra nel pool di scambio. */
  bloccataAlGiorno: boolean
  pasti: Record<Pasto, VocePiano>
}

/** Un template caricato. Store versionato: i piani precedenti non si sovrascrivono mai. */
export interface Piano {
  /** Hash del contenuto normalizzato: lo stesso file ricaricato non duplica il piano. */
  pianoId: string
  caricatoIl: string // timestamp ISO
  attivo: boolean
  nomeFile: string
  giornate: GiornataPiano[] // sempre 7, in ordine Lunedì→Domenica
}

/** Stato della settimana corrente. Il reset è un confronto di settimana ISO, non un timer. */
export interface StatoSettimana {
  settimana: SettimanaISO
  /** data → giornata-opzione confermata quel giorno. */
  conferme: Record<DataLocale, Giorno>
  /** Giornate-opzione già consumate nella settimana (fuori dal pool fino al reset). */
  consumate: Giorno[]
  /** Piano caricato con "Applica da lunedì prossimo": diventa attivo al reset. */
  pianoPendenteId?: string
}

/**
 * Snapshot testuale autosufficiente di un pasto registrato.
 * Deve restare leggibile anche dopo la sostituzione del piano: nessun riferimento
 * risolvibile solo contro il piano attivo.
 */
export interface PastoConsumato {
  data: DataLocale
  pasto: Pasto
  pianoId: string
  /** null per i pasti fuori piano. */
  giornataOpzione: Giorno | null
  alimentiPrincipali: string
  /** Testo dell'alternativa scelta (mai il numero); null se "Altro" o fuori piano. */
  alternativaScelta: string | null
  /** Testo libero di "Altro" o del fuori piano; la compilazione è facoltativa. */
  altroTesto: string | null
  chips: string[]
  nota: string | null
  timestamp: string // ISO
  /** Pasto confermato su una giornata poi cambiata (§3): resta in storico marcato. */
  giornataPrecedente?: boolean
  fuoriPiano?: boolean
}

export interface Impostazioni {
  /** Set corrente dei chip nota; i record storici conservano i chip con cui furono salvati. */
  chips: string[]
  bloccoAttivo: boolean
  /** Hash del PIN (mai in chiaro); null se il PIN non è impostato. */
  pinHash: string | null
  autoLockMinuti: number
  /** Timestamp ISO dell'ultimo export backup; guida il promemoria del lunedì. */
  ultimoBackup: string | null
}

export const CHIPS_DEFAULT = ['Ok', 'Gonfiore', 'Reflusso', 'Fame', 'Poco appetito']
export const AUTO_LOCK_DEFAULT_MINUTI = 5
/** Oltre questa età del piano compare il promemoria non bloccante (§ Pagina Piano). */
export const ETA_PIANO_PROMEMORIA_GIORNI = 35
