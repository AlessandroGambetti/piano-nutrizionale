import { useEffect, useState } from 'react'
import type { Giorno, GiornataPiano, Pasto } from '../domain/types'
import { PASTI } from '../domain/types'
import { useDati, useServizi } from './contesto'
import { dataEstesa, pastiDaPiano } from './util'
import { daDataLocale, giornoNaturale } from '../data/date'
import { Dialogo, VuotoConMessaggio } from './condivisi'
import { DettaglioPasto } from './DettaglioPasto'

export function Oggi() {
  const servizi = useServizi()
  const { pronto, oggi, piano, stato, pastiOggi, ricarica } = useDati()

  const [pool, setPool] = useState<GiornataPiano[]>([])
  const [espansa, setEspansa] = useState<Giorno | null>(null)
  const [dettaglio, setDettaglio] = useState<Pasto | null>(null)
  const [avvisoCambio, setAvvisoCambio] = useState(false)
  const [selettoreCambio, setSelettoreCambio] = useState(false)
  const [pastoFuoriPiano, setPastoFuoriPiano] = useState<Pasto | null>(null)
  const [testoFuoriPiano, setTestoFuoriPiano] = useState('')

  const naturale = giornoNaturale(daDataLocale(oggi))
  const confermata = stato?.conferme[oggi]
  const giornata = confermata ? (piano?.giornate.find((g) => g.giorno === confermata) ?? null) : null
  const vivi = pastiDaPiano(pastiOggi)
  const prossimo = giornata ? PASTI.find((p) => !vivi.some((r) => r.pasto === p)) : undefined

  useEffect(() => {
    if (!pronto) return
    void servizi.motore.pool(oggi).then(setPool)
  }, [servizi, pronto, oggi, stato])

  async function conferma(giorno: Giorno) {
    if (confermata) await servizi.motore.cambiaGiornata(oggi, giorno)
    else await servizi.motore.confermaGiornata(oggi, giorno)
    setSelettoreCambio(false)
    setEspansa(null)
    await ricarica()
  }

  async function confermaPastoRapido(pasto: Pasto) {
    if (!piano || !giornata) return
    // conferma a 1 tap: registrato come da piano, senza aprire il dettaglio (§4)
    await servizi.pasti.salvaDaPiano({
      data: oggi,
      pasto,
      pianoId: piano.pianoId,
      giornataOpzione: giornata.giorno,
      alimentiPrincipali: giornata.pasti[pasto].alimentiPrincipali,
      alternativaScelta: null,
      altroTesto: null,
      chips: [],
      nota: null,
      timestamp: new Date().toISOString(),
    })
    await ricarica()
  }

  async function salvaFuoriPiano() {
    if (!piano || pastoFuoriPiano === null) return
    await servizi.pasti.aggiungiFuoriPiano({
      data: oggi,
      pasto: pastoFuoriPiano,
      pianoId: piano.pianoId,
      giornataOpzione: null,
      alimentiPrincipali: '',
      alternativaScelta: null,
      altroTesto: testoFuoriPiano.trim(),
      chips: [],
      nota: null,
      timestamp: new Date().toISOString(),
      fuoriPiano: true,
    })
    setPastoFuoriPiano(null)
    setTestoFuoriPiano('')
    await ricarica()
  }

  if (!pronto) return null

  if (!piano) {
    return (
      <div className="pagina">
        <VuotoConMessaggio
          titolo="Nessun piano caricato"
          dettaglio="Vai nella tab Piano e carica il template xlsx per iniziare."
        />
      </div>
    )
  }

  if (dettaglio && giornata) {
    return <DettaglioPasto giornata={giornata} pasto={dettaglio} onChiudi={() => setDettaglio(null)} />
  }

  const usate = stato?.consumate.length ?? 0

  // ---- stato 1: giornata da confermare (o selettore per il cambio) ----
  if (!giornata || selettoreCambio) {
    return (
      <div className="pagina">
        <header className="intestazione">
          <div>
            <h2>{dataEstesa(oggi)}</h2>
            <p className="sottotitolo">{usate}/7 opzioni usate questa settimana</p>
          </div>
          {selettoreCambio && (
            <button className="testuale" onClick={() => setSelettoreCambio(false)}>
              Annulla
            </button>
          )}
        </header>
        {selettoreCambio && <p className="suggerimento">Scegli la nuova giornata per oggi.</p>}
        {pool.length === 0 && (
          <VuotoConMessaggio
            titolo="Nessuna giornata disponibile"
            dettaglio="Tutte le opzioni della settimana sono state usate. Il pool si ripristina lunedì."
          />
        )}
        <div className="lista-card">
          {pool.map((g, i) => {
            const preselezionata = !selettoreCambio && i === 0
            const aperta = espansa === g.giorno || preselezionata
            return (
              <div key={g.giorno} className={`card ${preselezionata ? 'preselezionata' : ''}`}>
                <button
                  className="card-testata"
                  onClick={() => setEspansa(espansa === g.giorno ? null : g.giorno)}
                >
                  <span className="card-titolo">
                    {g.giorno}
                    {g.giorno === naturale && <span className="badge-naturale">oggi</span>}
                    {g.bloccataAlGiorno && <span className="badge-bloccata">solo {g.giorno}</span>}
                  </span>
                  <span className="anteprima">
                    <b>Pranzo</b> {g.pasti['Pranzo'].alimentiPrincipali}
                  </span>
                  <span className="anteprima">
                    <b>Cena</b> {g.pasti['Cena'].alimentiPrincipali}
                  </span>
                </button>
                {aperta && !preselezionata && (
                  <div className="card-espansione">
                    {PASTI.map((p) => (
                      <p key={p} className="sintesi-pasto">
                        <b>{p}</b> {g.pasti[p].alimentiPrincipali}
                      </p>
                    ))}
                  </div>
                )}
                {(aperta || preselezionata) && (
                  <button className="primario" onClick={() => void conferma(g.giorno)}>
                    {preselezionata ? `Conferma giornata di ${g.giorno}` : 'Conferma questa giornata'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---- stato 2: giornata confermata, timeline dei 5 pasti ----
  return (
    <div className="pagina">
      <header className="intestazione">
        <div>
          <h2>{dataEstesa(oggi)}</h2>
          <p className="sottotitolo">
            {giornata.giorno !== naturale && <span className="badge-opzione">Opzione: {giornata.giorno}</span>}
            {giornata.giorno === naturale && 'Giornata del piano naturale'}
          </p>
        </div>
        <button
          className="testuale"
          onClick={() => (vivi.length > 0 ? setAvvisoCambio(true) : setSelettoreCambio(true))}
        >
          Cambia
        </button>
      </header>

      <div className="timeline">
        {PASTI.map((pasto) => {
          const record = vivi.find((r) => r.pasto === pasto)
          const fuori = pastiOggi.filter((r) => r.pasto === pasto && r.fuoriPiano)
          const evidenza = pasto === prossimo
          return (
            <div key={pasto} className={`card pasto ${evidenza ? 'evidenza' : ''} ${record ? 'consumato' : ''}`}>
              <button className="card-testata" onClick={() => setDettaglio(pasto)}>
                <span className="card-titolo">
                  {pasto}
                  <span className="stati">
                    {record && <span title="Consumato">✓</span>}
                    {record && (record.alternativaScelta || record.altroTesto !== null) && (
                      <span title="Alternativa scelta">🍽</span>
                    )}
                    {record && (record.nota || record.chips.length > 0) && <span title="Nota presente">📝</span>}
                  </span>
                </span>
                <span className="anteprima">{giornata.pasti[pasto].alimentiPrincipali}</span>
                {fuori.length > 0 && (
                  <span className="fuori-piano-nota">+ {fuori.length} fuori piano</span>
                )}
              </button>
              <div className="card-azioni">
                {evidenza && !record && (
                  <button className="primario compatto" onClick={() => void confermaPastoRapido(pasto)}>
                    Conferma pasto
                  </button>
                )}
                <button className="testuale" onClick={() => setPastoFuoriPiano(pasto)}>
                  Fuori piano
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {avvisoCambio && (
        <Dialogo
          titolo="Cambiare giornata?"
          azioni={
            <>
              <button className="testuale" onClick={() => setAvvisoCambio(false)}>
                Annulla
              </button>
              <button
                className="primario compatto"
                onClick={() => {
                  setAvvisoCambio(false)
                  setSelettoreCambio(true)
                }}
              >
                Cambia comunque
              </button>
            </>
          }
        >
          <p>Hai già confermato dei pasti sulla giornata di {giornata.giorno}:</p>
          <ul>
            {vivi.map((r) => (
              <li key={r.pasto}>{r.pasto}</li>
            ))}
          </ul>
          <p>
            Resteranno nello storico marcati come "giornata precedente". I pasti della nuova giornata
            ripartiranno tutti da confermare.
          </p>
        </Dialogo>
      )}

      {pastoFuoriPiano !== null && (
        <Dialogo
          titolo={`Fuori piano — ${pastoFuoriPiano}`}
          azioni={
            <>
              <button
                className="testuale"
                onClick={() => {
                  setPastoFuoriPiano(null)
                  setTestoFuoriPiano('')
                }}
              >
                Annulla
              </button>
              <button className="primario compatto" onClick={() => void salvaFuoriPiano()}>
                Registra
              </button>
            </>
          }
        >
          <p className="suggerimento">
            Registra cosa hai mangiato fuori piano: non tocca la giornata confermata né il pool.
          </p>
          <textarea
            autoFocus
            value={testoFuoriPiano}
            onChange={(e) => setTestoFuoriPiano(e.target.value)}
            placeholder="Es. pizza con i colleghi"
            rows={3}
          />
        </Dialogo>
      )}

    </div>
  )
}
