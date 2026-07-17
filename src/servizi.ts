// Composizione dei moduli del data layer: l'unico punto in cui la UI
// incontra le implementazioni concrete. Le pagine ricevono solo interfacce.
import type { Exporter, MotoreSettimanale, ParserPiano, RepoImpostazioni, RepoPasti, RepoPiani, RepoSettimana } from './domain/ports'
import { apriDb } from './data/db'
import { RepoImpostazioniIdb, RepoPastiIdb, RepoPianiIdb, RepoSettimanaIdb } from './data/repos'
import { MotoreSettimanaleImpl } from './data/motore'
import { ExporterImpl } from './data/exporter'

export interface Servizi {
  parser: ParserPiano
  piani: RepoPiani
  settimana: RepoSettimana
  pasti: RepoPasti
  impostazioni: RepoImpostazioni
  motore: MotoreSettimanale
  exporter: Exporter
}

export async function creaServizi(): Promise<Servizi> {
  const db = await apriDb()
  const piani = new RepoPianiIdb(db)
  const settimana = new RepoSettimanaIdb(db)
  const pasti = new RepoPastiIdb(db)
  const impostazioni = new RepoImpostazioniIdb(db)
  // SheetJS si carica solo quando serve davvero (upload di un nuovo piano)
  const parser: ParserPiano = {
    async parse(contenuto) {
      const { ParserPianoXlsx } = await import('./data/parser')
      return new ParserPianoXlsx().parse(contenuto)
    },
  }
  return {
    parser,
    piani,
    settimana,
    pasti,
    impostazioni,
    motore: new MotoreSettimanaleImpl(piani, settimana, pasti),
    exporter: new ExporterImpl(db, impostazioni),
  }
}
