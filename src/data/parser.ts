import { read, utils } from 'xlsx'
import { GIORNI, PASTI, type Giorno, type GiornataPiano, type Pasto, type VocePiano } from '../domain/types'
import type { ErroreValidazione, EsitoParse, ParserPiano } from '../domain/ports'

const FOGLIO = 'PIANO'
const INTESTAZIONI = [
  'Giorno',
  'Pasto',
  'AlimentiPrincipali',
  'Alternativa1',
  'Alternativa2',
  'Alternativa3',
  'BloccatoAlGiorno',
] as const

function testo(cella: unknown): string {
  return cella == null ? '' : String(cella).trim()
}

export class ParserPianoXlsx implements ParserPiano {
  parse(contenuto: ArrayBuffer): EsitoParse {
    const errori: ErroreValidazione[] = []
    const avvisi: string[] = []

    let wb
    try {
      wb = read(new Uint8Array(contenuto), { type: 'array' })
    } catch {
      return { ok: false, errori: [{ messaggio: 'File non leggibile: non è un xlsx valido.' }] }
    }

    const foglio = wb.Sheets[FOGLIO]
    if (!foglio) {
      return {
        ok: false,
        errori: [{ messaggio: `Foglio "${FOGLIO}" non trovato (fogli presenti: ${wb.SheetNames.join(', ')}).` }],
      }
    }
    if (wb.SheetNames.length > 1) {
      avvisi.push(`Il file contiene altri fogli oltre a "${FOGLIO}": verranno ignorati.`)
    }

    const righe: unknown[][] = utils.sheet_to_json(foglio, { header: 1, defval: '' })
    if (righe.length === 0) return { ok: false, errori: [{ messaggio: 'Il foglio PIANO è vuoto.' }] }

    const intestazione = (righe[0] ?? []).map(testo)
    INTESTAZIONI.forEach((attesa, i) => {
      if (intestazione[i] !== attesa) {
        errori.push({
          riga: 1,
          campo: attesa,
          messaggio: `Colonna ${i + 1}: attesa "${attesa}", trovata "${intestazione[i] ?? ''}".`,
        })
      }
    })
    if (errori.length > 0) return { ok: false, errori }

    // (giorno, pasto) → voce; blocco raccolto per giornata per la verifica di coerenza
    const voci = new Map<string, VocePiano>()
    const bloccoPerGiorno = new Map<Giorno, Set<string>>()

    for (let i = 1; i < righe.length; i++) {
      const r = righe[i]
      const numeroRiga = i + 1
      const [giorno, pasto, alimenti, alt1, alt2, alt3, blocco] = [
        testo(r[0]), testo(r[1]), testo(r[2]), testo(r[3]), testo(r[4]), testo(r[5]), testo(r[6]),
      ]
      if (!giorno && !pasto && !alimenti) continue // riga vuota in coda

      if (!(GIORNI as readonly string[]).includes(giorno)) {
        errori.push({ riga: numeroRiga, campo: 'Giorno', messaggio: `Giorno non valido: "${giorno}".` })
        continue
      }
      if (!(PASTI as readonly string[]).includes(pasto)) {
        errori.push({ riga: numeroRiga, campo: 'Pasto', messaggio: `Pasto non valido: "${pasto}".` })
        continue
      }
      const chiave = `${giorno}|${pasto}`
      if (voci.has(chiave)) {
        errori.push({ riga: numeroRiga, messaggio: `Combinazione duplicata: ${giorno} / ${pasto}.` })
        continue
      }
      if (!alimenti) {
        errori.push({ riga: numeroRiga, campo: 'AlimentiPrincipali', messaggio: `Cella obbligatoria vuota per ${giorno} / ${pasto}.` })
        continue
      }
      const bloccoNorm = blocco.toUpperCase()
      if (bloccoNorm !== 'SI' && bloccoNorm !== 'SÌ' && bloccoNorm !== 'NO') {
        errori.push({ riga: numeroRiga, campo: 'BloccatoAlGiorno', messaggio: `Valore non valido "${blocco}" (ammessi: SI, NO) per ${giorno} / ${pasto}.` })
        continue
      }

      voci.set(chiave, {
        giorno: giorno as Giorno,
        pasto: pasto as Pasto,
        alimentiPrincipali: alimenti,
        alternative: [alt1, alt2, alt3].filter((a) => a !== ''),
      })
      const set = bloccoPerGiorno.get(giorno as Giorno) ?? new Set<string>()
      set.add(bloccoNorm === 'SÌ' ? 'SI' : bloccoNorm)
      bloccoPerGiorno.set(giorno as Giorno, set)
    }

    for (const giorno of GIORNI) {
      for (const pasto of PASTI) {
        if (!voci.has(`${giorno}|${pasto}`) && !errori.some((e) => e.messaggio.includes(`${giorno} / ${pasto}`))) {
          errori.push({ messaggio: `Riga mancante: ${giorno} / ${pasto}.` })
        }
      }
    }
    if (errori.length > 0) return { ok: false, errori }

    const giornate: GiornataPiano[] = GIORNI.map((giorno) => {
      const blocchi = bloccoPerGiorno.get(giorno)!
      // BloccatoAlGiorno è proprietà della giornata: un solo SI blocca tutto (§2)
      if (blocchi.size > 1) {
        avvisi.push(`${giorno}: BloccatoAlGiorno incoerente tra le righe — la giornata è stata considerata bloccata.`)
      }
      const pasti = {} as Record<Pasto, VocePiano>
      for (const pasto of PASTI) pasti[pasto] = voci.get(`${giorno}|${pasto}`)!
      return { giorno, bloccataAlGiorno: blocchi.has('SI'), pasti }
    })

    return { ok: true, giornate, avvisi }
  }
}
