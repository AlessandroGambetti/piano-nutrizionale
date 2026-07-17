// Piano sintetico per i test: nessun dato reale della nutrizionista.
import { utils, write } from 'xlsx'
import { GIORNI, PASTI, type GiornataPiano, type Pasto, type VocePiano } from '../domain/types'

export const GIORNI_BLOCCATI_FIXTURE = ['Mercoledì', 'Venerdì', 'Domenica'] as const

export function righeTemplateValide(): string[][] {
  const righe: string[][] = [
    ['Giorno', 'Pasto', 'AlimentiPrincipali', 'Alternativa1', 'Alternativa2', 'Alternativa3', 'BloccatoAlGiorno'],
  ]
  for (const giorno of GIORNI) {
    for (const pasto of PASTI) {
      righe.push([
        giorno,
        pasto,
        `Alimenti di ${pasto} del ${giorno}`,
        `${pasto} ${giorno} — piatto A`,
        `${pasto} ${giorno} — piatto B`,
        `${pasto} ${giorno} — piatto C`,
        (GIORNI_BLOCCATI_FIXTURE as readonly string[]).includes(giorno) ? 'SI' : 'NO',
      ])
    }
  }
  return righe
}

export function xlsxDaRighe(righe: unknown[][], nomeFoglio = 'PIANO'): ArrayBuffer {
  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.aoa_to_sheet(righe), nomeFoglio)
  return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

export function giornateFixture(): GiornataPiano[] {
  return GIORNI.map((giorno) => {
    const pasti = {} as Record<Pasto, VocePiano>
    for (const pasto of PASTI) {
      pasti[pasto] = {
        giorno,
        pasto,
        alimentiPrincipali: `Alimenti di ${pasto} del ${giorno}`,
        alternative: [`${pasto} ${giorno} — piatto A`, `${pasto} ${giorno} — piatto B`],
      }
    }
    return {
      giorno,
      bloccataAlGiorno: (GIORNI_BLOCCATI_FIXTURE as readonly string[]).includes(giorno),
      pasti,
    }
  })
}
