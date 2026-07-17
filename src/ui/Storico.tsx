import { useEffect, useMemo, useState } from 'react'
import type { PastoConsumato, SettimanaISO } from '../domain/types'
import { PASTI } from '../domain/types'
import { useDati, useServizi } from './contesto'
import { daDataLocale, settimanaISO } from '../data/date'
import { condividiFile, dataEstesa } from './util'
import { VuotoConMessaggio } from './condivisi'

export function Storico() {
  const servizi = useServizi()
  const { pastiOggi } = useDati() // dipendenza: ricarica lo storico dopo ogni conferma

  const [records, setRecords] = useState<PastoConsumato[]>([])
  const [filtro, setFiltro] = useState<'tutte' | SettimanaISO>('tutte')

  useEffect(() => {
    void servizi.pasti.tutti().then(setRecords)
  }, [servizi, pastiOggi])

  const settimane = useMemo(() => {
    const set = new Set(records.map((r) => settimanaISO(daDataLocale(r.data))))
    return [...set].sort().reverse()
  }, [records])

  const filtrati = useMemo(() => {
    const base = filtro === 'tutte' ? records : records.filter((r) => settimanaISO(daDataLocale(r.data)) === filtro)
    return [...base].sort(
      (a, b) =>
        b.data.localeCompare(a.data) ||
        PASTI.indexOf(a.pasto) - PASTI.indexOf(b.pasto) ||
        a.timestamp.localeCompare(b.timestamp),
    )
  }, [records, filtro])

  const perData = useMemo(() => {
    const mappa = new Map<string, PastoConsumato[]>()
    for (const r of filtrati) {
      const lista = mappa.get(r.data) ?? []
      lista.push(r)
      mappa.set(r.data, lista)
    }
    return [...mappa.entries()]
  }, [filtrati])

  async function esporta() {
    // ordine cronologico per la nutrizionista
    const cronologico = [...filtrati].reverse()
    await condividiFile('storico-piano-nutrizionale.csv', servizi.exporter.csvStorico(cronologico))
  }

  return (
    <div className="pagina">
      <header className="intestazione">
        <h2>Storico</h2>
        <button className="testuale" onClick={() => void esporta()} disabled={filtrati.length === 0}>
          Esporta CSV
        </button>
      </header>

      <div className="filtro-settimana">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} aria-label="Filtro settimana">
          <option value="tutte">Tutte le settimane</option>
          {settimane.map((s) => (
            <option key={s} value={s}>
              Settimana {s.replace('-W', ' · n. ')}
            </option>
          ))}
        </select>
      </div>

      {perData.length === 0 && (
        <VuotoConMessaggio titolo="Nessun pasto registrato" dettaglio="Le conferme compariranno qui." />
      )}

      {perData.map(([data, lista]) => {
        const giornata = lista.find((r) => r.giornataOpzione && !r.giornataPrecedente)?.giornataOpzione
        return (
          <section key={data} className="giorno-storico">
            <h3>
              {dataEstesa(data)}
              {giornata && <span className="badge-opzione">Opzione: {giornata}</span>}
            </h3>
            {lista.map((r, i) => (
              <div key={i} className={`riga-storico ${r.giornataPrecedente ? 'precedente' : ''}`}>
                <div className="riga-testata">
                  <b>{r.pasto}</b>
                  {r.fuoriPiano && <span className="badge-fuori">Fuori piano</span>}
                  {r.giornataPrecedente && <span className="badge-precedente">Giornata cambiata ({r.giornataOpzione})</span>}
                </div>
                {r.alternativaScelta && <p className="riga-dettaglio">🍽 {r.alternativaScelta}</p>}
                {r.altroTesto !== null && r.altroTesto !== '' && <p className="riga-dettaglio">✏️ {r.altroTesto}</p>}
                {r.chips.length > 0 && (
                  <p className="riga-dettaglio chips-storico">
                    {r.chips.map((c) => (
                      <span key={c} className="chip statico">
                        {c}
                      </span>
                    ))}
                  </p>
                )}
                {r.nota && <p className="riga-dettaglio nota-storico">{r.nota}</p>}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
