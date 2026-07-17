import type { PastoConsumato } from '../domain/types'
import type { Exporter, RepoImpostazioni } from '../domain/ports'
import { dumpDb, ripristinaDb, type Db, type DumpDb } from './db'

// Separatore ';' — Excel in locale italiano usa ';' come elenco: con ',' l'intero
// storico finirebbe in una colonna sola.
const SEP = ';'
const INTESTAZIONE = ['Data', 'Pasto', 'GiornataOpzione', 'Alternativa', 'Altro', 'Chip', 'Nota', 'FuoriPiano']

function campoCsv(valore: string): string {
  return /[";\n\r]/.test(valore) ? `"${valore.replace(/"/g, '""')}"` : valore
}

export class ExporterImpl implements Exporter {
  private db: Db
  private impostazioni: RepoImpostazioni

  constructor(db: Db, impostazioni: RepoImpostazioni) {
    this.db = db
    this.impostazioni = impostazioni
  }

  csvStorico(records: PastoConsumato[]): Blob {
    const righe = records.map((r) =>
      [
        r.data,
        r.pasto,
        r.giornataOpzione ?? '',
        r.alternativaScelta ?? '',
        r.altroTesto ?? '',
        r.chips.join(' + '),
        r.nota ?? '',
        r.fuoriPiano ? 'SI' : 'NO',
      ]
        .map(campoCsv)
        .join(SEP),
    )
    // BOM UTF-8: senza, Excel legge il CSV come ANSI e storpia gli accenti (criterio §7.6)
    const csv = String.fromCharCode(0xfeff) + [INTESTAZIONE.join(SEP), ...righe].join('\r\n') + '\r\n'
    return new Blob([csv], { type: 'text/csv;charset=utf-8' })
  }

  async backupCompleto(): Promise<Blob> {
    const dump = await dumpDb(this.db)
    // il timestamp dell'ultimo backup guida il promemoria del lunedì (§ Impostazioni)
    const imp = await this.impostazioni.leggi()
    await this.impostazioni.scrivi({ ...imp, ultimoBackup: dump.esportatoIl })
    return new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
  }

  async ripristinaBackup(json: string): Promise<void> {
    let dump: DumpDb
    try {
      dump = JSON.parse(json)
    } catch {
      throw new Error('Backup non leggibile: JSON non valido.')
    }
    if (dump?.versione !== 1 || !Array.isArray(dump.piani) || !Array.isArray(dump.pasti)) {
      throw new Error('Backup non riconosciuto: formato o versione non supportati.')
    }
    await ripristinaDb(this.db, dump)
  }
}
