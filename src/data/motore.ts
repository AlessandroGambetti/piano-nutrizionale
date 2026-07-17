import type { DataLocale, Giorno, GiornataPiano, StatoSettimana } from '../domain/types'
import type { MotoreSettimanale, RepoPasti, RepoPiani, RepoSettimana } from '../domain/ports'
import { daDataLocale, giornoNaturale, settimanaISO } from './date'

export class ErroreDominio extends Error {}

export class MotoreSettimanaleImpl implements MotoreSettimanale {
  private piani: RepoPiani
  private settimana: RepoSettimana
  private pasti: RepoPasti
  private orologio: () => Date

  constructor(
    piani: RepoPiani,
    settimana: RepoSettimana,
    pasti: RepoPasti,
    orologio: () => Date = () => new Date(),
  ) {
    this.piani = piani
    this.settimana = settimana
    this.pasti = pasti
    this.orologio = orologio
  }

  async allinea(adesso: Date): Promise<StatoSettimana> {
    const corrente = settimanaISO(adesso)
    const stato = await this.settimana.leggi()
    if (stato && stato.settimana === corrente) return stato

    // Cambio settimana (o primo avvio): pool ripristinato, conferme azzerate,
    // storico intatto. L'eventuale piano pendente diventa attivo ora.
    if (stato?.pianoPendenteId) await this.piani.attiva(stato.pianoPendenteId)
    const nuovo: StatoSettimana = { settimana: corrente, conferme: {}, consumate: [] }
    await this.settimana.scrivi(nuovo)
    return nuovo
  }

  async pool(data: DataLocale): Promise<GiornataPiano[]> {
    const piano = await this.piani.pianoAttivo()
    if (!piano) return []
    const stato = await this.settimana.leggi()
    const consumate = new Set(stato?.consumate ?? [])
    const naturale = giornoNaturale(daDataLocale(data))

    const disponibili = piano.giornate.filter(
      (g) => !consumate.has(g.giorno) && (!g.bloccataAlGiorno || g.giorno === naturale),
    )
    // Giornata naturale in cima: è la preselezione a 1 tap della pagina Oggi.
    return disponibili.sort((a, b) =>
      a.giorno === naturale ? -1 : b.giorno === naturale ? 1 : 0,
    )
  }

  async confermaGiornata(data: DataLocale, giorno: Giorno): Promise<void> {
    const disponibili = await this.pool(data)
    if (!disponibili.some((g) => g.giorno === giorno)) {
      throw new ErroreDominio(`La giornata "${giorno}" non è disponibile per il ${data}.`)
    }
    const stato = await this.statoObbligatorio()
    const precedente = stato.conferme[data]
    const consumate = stato.consumate.filter((g) => g !== precedente)
    consumate.push(giorno)
    await this.settimana.scrivi({ ...stato, conferme: { ...stato.conferme, [data]: giorno }, consumate })
  }

  async cambiaGiornata(data: DataLocale, nuovoGiorno: Giorno): Promise<void> {
    // L'avviso bloccante con l'elenco dei pasti già confermati è responsabilità
    // della UI, PRIMA di questa chiamata. Qui si applica esattamente la regola §3.
    await this.pasti.marcaGiornataPrecedente(data)
    await this.confermaGiornata(data, nuovoGiorno)
  }

  async resetManuale(): Promise<void> {
    const stato = await this.settimana.leggi()
    await this.settimana.scrivi({
      settimana: settimanaISO(this.orologio()),
      conferme: {},
      consumate: [],
      // il piano pendente resta pendente: si attiva solo al cambio settimana reale
      ...(stato?.pianoPendenteId ? { pianoPendenteId: stato.pianoPendenteId } : {}),
    })
  }

  private async statoObbligatorio(): Promise<StatoSettimana> {
    const stato = await this.settimana.leggi()
    if (!stato) throw new ErroreDominio('Stato settimana assente: chiamare prima allinea().')
    return stato
  }
}
