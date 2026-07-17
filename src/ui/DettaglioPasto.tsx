import { useMemo, useState } from 'react'
import type { GiornataPiano, Pasto, PastoConsumato } from '../domain/types'
import { useDati, useServizi } from './contesto'

export function DettaglioPasto({
  giornata,
  pasto,
  onChiudi,
}: {
  giornata: GiornataPiano
  pasto: Pasto
  onChiudi: () => void
}) {
  const servizi = useServizi()
  const { oggi, piano, pastiOggi, impostazioni, ricarica } = useDati()
  const voce = giornata.pasti[pasto]

  const esistente = pastiOggi.find(
    (r) => r.pasto === pasto && !r.fuoriPiano && !r.giornataPrecedente,
  )

  // 'piano' = come da indicazioni, senza alternativa; indice 0-2 = alternativa; 'altro' = testo libero
  const [scelta, setScelta] = useState<number | 'altro' | 'piano'>(() => {
    if (esistente?.alternativaScelta) {
      const i = voce.alternative.indexOf(esistente.alternativaScelta)
      if (i >= 0) return i
    }
    if (esistente && esistente.altroTesto !== null) return 'altro'
    return 'piano'
  })
  const [testoAltro, setTestoAltro] = useState(esistente?.altroTesto ?? '')
  const [chips, setChips] = useState<Set<string>>(new Set(esistente?.chips ?? []))
  const [nota, setNota] = useState(esistente?.nota ?? '')
  const [salvataggio, setSalvataggio] = useState(false)

  // i record storici conservano i loro chip anche se il set è cambiato da Impostazioni
  const chipDisponibili = useMemo(() => {
    const set = [...impostazioni.chips]
    for (const c of esistente?.chips ?? []) if (!set.includes(c)) set.push(c)
    return set
  }, [impostazioni.chips, esistente])

  function commutaChip(chip: string) {
    setChips((prima) => {
      const dopo = new Set(prima)
      if (dopo.has(chip)) dopo.delete(chip)
      else dopo.add(chip)
      return dopo
    })
  }

  async function conferma() {
    if (!piano) return
    setSalvataggio(true)
    const record: PastoConsumato = {
      data: oggi,
      pasto,
      pianoId: piano.pianoId,
      giornataOpzione: giornata.giorno,
      alimentiPrincipali: voce.alimentiPrincipali,
      alternativaScelta: typeof scelta === 'number' ? voce.alternative[scelta] : null,
      // "Altro" con testo vuoto è valido (criterio §7.4): '' ≠ null
      altroTesto: scelta === 'altro' ? testoAltro.trim() : null,
      chips: [...chips],
      nota: nota.trim() === '' ? null : nota.trim(),
      timestamp: new Date().toISOString(),
    }
    await servizi.pasti.salvaDaPiano(record)
    await ricarica()
    setSalvataggio(false)
    onChiudi()
  }

  return (
    <div className="pagina dettaglio-pasto">
      <header className="intestazione">
        <button className="indietro" onClick={onChiudi} aria-label="Torna a Oggi">
          ‹ Oggi
        </button>
        <div>
          <h2>{pasto}</h2>
          <p className="sottotitolo">Giornata: {giornata.giorno}</p>
        </div>
      </header>

      <section className="blocco-alimenti">
        <h3>Alimenti principali</h3>
        <p>{voce.alimentiPrincipali}</p>
      </section>

      <section>
        <h3>Cosa preparo</h3>
        <p className="suggerimento">Proposte di piatti, non prescrizioni. Se segui le indicazioni così come sono, non serve scegliere.</p>
        <div className="opzioni" role="radiogroup" aria-label="Cosa preparo">
          <label className={`opzione ${scelta === 'piano' ? 'attiva' : ''}`}>
            <input type="radio" name="scelta" checked={scelta === 'piano'} onChange={() => setScelta('piano')} />
            <span>Come da indicazioni</span>
          </label>
          {voce.alternative.map((alt, i) => (
            <label key={i} className={`opzione ${scelta === i ? 'attiva' : ''}`}>
              <input type="radio" name="scelta" checked={scelta === i} onChange={() => setScelta(i)} />
              <span>{alt}</span>
            </label>
          ))}
          <label className={`opzione ${scelta === 'altro' ? 'attiva' : ''}`}>
            <input type="radio" name="scelta" checked={scelta === 'altro'} onChange={() => setScelta('altro')} />
            <span>Altro</span>
          </label>
          {scelta === 'altro' && (
            <textarea
              className="testo-altro"
              placeholder="Cosa hai preparato? (facoltativo)"
              value={testoAltro}
              onChange={(e) => setTestoAltro(e.target.value)}
              rows={2}
            />
          )}
        </div>
      </section>

      <section>
        <h3>Come è andata</h3>
        <div className="chips">
          {chipDisponibili.map((chip) => (
            <button
              key={chip}
              className={`chip ${chips.has(chip) ? 'selezionato' : ''}`}
              onClick={() => commutaChip(chip)}
              aria-pressed={chips.has(chip)}
            >
              {chip}
            </button>
          ))}
        </div>
        <textarea
          className="nota"
          placeholder="Nota (facoltativa)"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
        />
      </section>

      <button className="primario" onClick={() => void conferma()} disabled={salvataggio}>
        {esistente ? 'Aggiorna pasto' : 'Conferma pasto'}
      </button>
    </div>
  )
}
