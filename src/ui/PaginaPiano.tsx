import { useRef, useState } from 'react'
import type { Giorno, GiornataPiano } from '../domain/types'
import { ETA_PIANO_PROMEMORIA_GIORNI, PASTI } from '../domain/types'
import type { ErroreValidazione } from '../domain/ports'
import { useDati, useServizi } from './contesto'
import { settimanaISO } from '../data/date'
import { etaGiorni } from './util'
import { Dialogo, VuotoConMessaggio } from './condivisi'

interface ParseInAttesa {
  giornate: GiornataPiano[]
  avvisi: string[]
  nomeFile: string
  differenze: string[]
}

export function PaginaPiano() {
  const servizi = useServizi()
  const { piano, ricarica } = useDati()
  const inputFile = useRef<HTMLInputElement>(null)

  const [giornoAperto, setGiornoAperto] = useState<Giorno | null>(null)
  const [errori, setErrori] = useState<ErroreValidazione[] | null>(null)
  const [inAttesa, setInAttesa] = useState<ParseInAttesa | null>(null)
  const [avvisoSubito, setAvvisoSubito] = useState(false)

  async function fileScelto(file: File) {
    setErrori(null)
    const esito = await servizi.parser.parse(await file.arrayBuffer())
    if (!esito.ok) {
      setErrori(esito.errori)
      return
    }
    if (!piano) {
      // primo caricamento: nessuna settimana da proteggere, si attiva subito
      const salvato = await servizi.piani.salva(esito.giornate, file.name)
      await servizi.piani.attiva(salvato.pianoId)
      await ricarica()
      return
    }
    setInAttesa({
      giornate: esito.giornate,
      avvisi: esito.avvisi,
      nomeFile: file.name,
      differenze: confrontaPiani(piano.giornate, esito.giornate),
    })
  }

  async function applicaDaLunedi() {
    if (!inAttesa) return
    const salvato = await servizi.piani.salva(inAttesa.giornate, inAttesa.nomeFile)
    const stato = await servizi.settimana.leggi()
    if (stato) await servizi.settimana.scrivi({ ...stato, pianoPendenteId: salvato.pianoId })
    setInAttesa(null)
    await ricarica()
  }

  async function applicaSubito() {
    if (!inAttesa) return
    const salvato = await servizi.piani.salva(inAttesa.giornate, inAttesa.nomeFile)
    await servizi.piani.attiva(salvato.pianoId)
    // pool e conferme della settimana corrente azzerati (avviso già mostrato); storico intatto
    await servizi.settimana.scrivi({ settimana: settimanaISO(new Date()), conferme: {}, consumate: [] })
    setAvvisoSubito(false)
    setInAttesa(null)
    await ricarica()
  }

  const eta = piano ? etaGiorni(piano.caricatoIl) : 0
  const daAggiornare = piano !== null && eta > ETA_PIANO_PROMEMORIA_GIORNI

  return (
    <div className="pagina">
      <header className="intestazione">
        <h2>Piano</h2>
        <button className="testuale" onClick={() => inputFile.current?.click()}>
          Carica nuovo piano
        </button>
        <input
          ref={inputFile}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void fileScelto(file)
            e.target.value = ''
          }}
        />
      </header>

      {!piano && (
        <VuotoConMessaggio
          titolo="Nessun piano attivo"
          dettaglio="Carica il template xlsx del piano per iniziare."
        />
      )}

      {piano && (
        <>
          <section className="scheda-piano">
            <p>
              <b>{piano.nomeFile}</b>
            </p>
            <p className="sottotitolo">
              Caricato {eta === 0 ? 'oggi' : `${eta} giorni fa`}
              {' · '}
              {new Date(piano.caricatoIl).toLocaleDateString('it-IT')}
            </p>
            {daAggiornare && (
              <p className="promemoria-eta">Piano caricato {eta} giorni fa — è ora di aggiornarlo?</p>
            )}
          </section>

          <h3>Anteprima per giorno</h3>
          <div className="lista-card">
            {piano.giornate.map((g) => (
              <div key={g.giorno} className="card">
                <button
                  className="card-testata"
                  onClick={() => setGiornoAperto(giornoAperto === g.giorno ? null : g.giorno)}
                >
                  <span className="card-titolo">
                    {g.giorno}
                    {g.bloccataAlGiorno && <span className="badge-bloccata">solo {g.giorno}</span>}
                  </span>
                </button>
                {giornoAperto === g.giorno && (
                  <div className="card-espansione">
                    {PASTI.map((p) => (
                      <div key={p} className="sintesi-pasto">
                        <b>{p}</b> {g.pasti[p].alimentiPrincipali}
                        {g.pasti[p].alternative.length > 0 && (
                          <ul className="alternative-anteprima">
                            {g.pasti[p].alternative.map((a, i) => (
                              <li key={i}>{a}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {errori && (
        <Dialogo
          titolo="Template non valido"
          azioni={
            <button className="primario compatto" onClick={() => setErrori(null)}>
              Chiudi
            </button>
          }
        >
          <p className="suggerimento">Il piano attivo non è stato toccato. Errori trovati:</p>
          <ul className="lista-errori">
            {errori.slice(0, 12).map((e, i) => (
              <li key={i}>
                {e.riga ? `Riga ${e.riga}: ` : ''}
                {e.messaggio}
              </li>
            ))}
            {errori.length > 12 && <li>… e altri {errori.length - 12} errori.</li>}
          </ul>
        </Dialogo>
      )}

      {inAttesa && !avvisoSubito && (
        <Dialogo
          titolo="Nuovo piano valido"
          azioni={
            <>
              <button className="testuale" onClick={() => setInAttesa(null)}>
                Annulla
              </button>
              <button className="testuale" onClick={() => setAvvisoSubito(true)}>
                Applica subito
              </button>
              <button className="primario compatto" onClick={() => void applicaDaLunedi()}>
                Applica da lunedì
              </button>
            </>
          }
        >
          {inAttesa.differenze.length === 0 && <p>Il contenuto è identico al piano attivo.</p>}
          {inAttesa.differenze.length > 0 && (
            <>
              <p className="suggerimento">Differenze rispetto al piano attivo:</p>
              <ul>
                {inAttesa.differenze.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {inAttesa.avvisi.map((a) => (
            <p key={a} className="avviso-parser">
              ⚠️ {a}
            </p>
          ))}
          <p>
            <b>Applica da lunedì</b>: la settimana in corso resta intatta, il nuovo piano parte al
            reset di lunedì.
          </p>
        </Dialogo>
      )}

      {inAttesa && avvisoSubito && (
        <Dialogo
          titolo="Applicare subito?"
          azioni={
            <>
              <button className="testuale" onClick={() => setAvvisoSubito(false)}>
                Indietro
              </button>
              <button className="primario compatto" onClick={() => void applicaSubito()}>
                Azzera e applica
              </button>
            </>
          }
        >
          <p>
            Il pool e le conferme della settimana corrente verranno <b>azzerati</b>. Lo storico dei
            pasti resta intatto e il piano attuale rimane ripristinabile dalle Impostazioni.
          </p>
        </Dialogo>
      )}
    </div>
  )
}

function confrontaPiani(vecchie: GiornataPiano[], nuove: GiornataPiano[]): string[] {
  const differenze: string[] = []
  for (const nuova of nuove) {
    const vecchia = vecchie.find((g) => g.giorno === nuova.giorno)
    if (!vecchia) continue
    const pastiDiversi = PASTI.filter((p) => {
      const a = vecchia.pasti[p]
      const b = nuova.pasti[p]
      return a.alimentiPrincipali !== b.alimentiPrincipali || a.alternative.join('|') !== b.alternative.join('|')
    })
    if (vecchia.bloccataAlGiorno !== nuova.bloccataAlGiorno) {
      differenze.push(`${nuova.giorno}: cambia il vincolo "bloccato al giorno".`)
    }
    if (pastiDiversi.length > 0) differenze.push(`${nuova.giorno}: ${pastiDiversi.join(', ')}.`)
  }
  return differenze
}
