// Interfacce dei moduli del data layer (§8 → contratto). La UI dipende SOLO da queste
// e da types.ts; le implementazioni vivono in src/data/ e non vengono importate direttamente.

import type {
  DataLocale,
  Giorno,
  GiornataPiano,
  Impostazioni,
  PastoConsumato,
  Piano,
  StatoSettimana,
} from './types'

// ---------------------------------------------------------------- parser xlsx

export interface ErroreValidazione {
  /** Riga del foglio PIANO (1-based, intestazione = 1); assente per errori globali. */
  riga?: number
  campo?: string
  messaggio: string
}

export type EsitoParse =
  | { ok: true; giornate: GiornataPiano[]; avvisi: string[] }
  | { ok: false; errori: ErroreValidazione[] }

export interface ParserPiano {
  /**
   * Valida e converte un template (§2): foglio PIANO, 35 righe giorno×pasto,
   * coerenza di BloccatoAlGiorno sulla giornata. Pura: non tocca lo stato,
   * la sostituzione del piano attivo è una decisione separata dell'utente (§ Pagina Piano).
   * Async per permettere il caricamento lazy di SheetJS (~0,5 MB, serve solo qui).
   */
  parse(contenuto: ArrayBuffer): Promise<EsitoParse>
}

// ------------------------------------------------------------------ repository

export interface RepoPiani {
  /** Calcola pianoId e archivia. Non attiva: idempotente sullo stesso contenuto. */
  salva(giornate: GiornataPiano[], nomeFile: string): Promise<Piano>
  attiva(pianoId: string): Promise<void>
  pianoAttivo(): Promise<Piano | null>
  perId(pianoId: string): Promise<Piano | null>
  elenca(): Promise<Piano[]>
}

export interface RepoSettimana {
  leggi(): Promise<StatoSettimana | null>
  scrivi(stato: StatoSettimana): Promise<void>
}

export interface RepoPasti {
  /** Upsert per (data, pasto): la ri-conferma sovrascrive, si storicizza l'ultima versione. */
  salvaDaPiano(record: PastoConsumato): Promise<void>
  /** Append: un fuori piano non sostituisce mai il pasto da piano della stessa data. */
  aggiungiFuoriPiano(record: PastoConsumato): Promise<void>
  perData(data: DataLocale): Promise<PastoConsumato[]>
  intervallo(da: DataLocale, a: DataLocale): Promise<PastoConsumato[]>
  tutti(): Promise<PastoConsumato[]>
  /** Marca giornata_precedente i pasti da piano della data (cambio giornata §3). */
  marcaGiornataPrecedente(data: DataLocale): Promise<PastoConsumato[]>
}

export interface RepoImpostazioni {
  leggi(): Promise<Impostazioni>
  scrivi(impostazioni: Impostazioni): Promise<void>
}

// ---------------------------------------------------------- motore settimanale

export interface MotoreSettimanale {
  /**
   * Allinea lo stato ad 'adesso': se la settimana ISO memorizzata differisce dalla
   * corrente esegue il reset (pool ripristinato, conferme azzerate, storico intatto,
   * eventuale pianoPendenteId attivato). Da chiamare a cold start E su
   * visibilitychange/focus: mai fidarsi di uno stato calcolato ieri.
   */
  allinea(adesso: Date): Promise<StatoSettimana>
  /**
   * Giornate selezionabili per la data: tutte quelle del piano attivo, meno le
   * consumate della settimana, meno le bloccate fuori dal loro giorno naturale.
   * Ordinamento: giornata naturale in cima (preselezione a 1 tap).
   */
  pool(data: DataLocale): Promise<GiornataPiano[]>
  confermaGiornata(data: DataLocale, giorno: Giorno): Promise<void>
  /**
   * Cambio con pasti già confermati: la UI mostra PRIMA l'avviso bloccante con
   * l'elenco dei pasti; qui i record esistenti vengono marcati giornata_precedente,
   * la vecchia giornata torna nel pool e la nuova parte con tutti i pasti non consumati.
   */
  cambiaGiornata(data: DataLocale, nuovoGiorno: Giorno): Promise<void>
  /** Rete di sicurezza da Impostazioni (con conferma della UI). */
  resetManuale(): Promise<void>
}

// ---------------------------------------------------------------------- export

export interface Exporter {
  /** CSV con BOM UTF-8 (Excel + caratteri italiani): data, pasto, giornata-opzione,
   *  alternativa, altro, chip, nota, fuori piano. */
  csvStorico(records: PastoConsumato[]): Blob
  /** Backup JSON completo: piani + settimana + storico + impostazioni. */
  backupCompleto(): Promise<Blob>
  ripristinaBackup(json: string): Promise<void>
}

// ------------------------------------------------------------------- date utils
// (firme del modulo src/data/date.ts, qui per riferimento del contratto)

export interface DateUtils {
  /** 'YYYY-MM-DD' da getFullYear/getMonth/getDate — MAI toISOString(). */
  dataLocale(d: Date): DataLocale
  settimanaISO(d: Date): string
  giornoNaturale(d: Date): Giorno
}
