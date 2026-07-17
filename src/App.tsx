import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useDati, useServizi } from './ui/contesto'
import { Oggi } from './ui/Oggi'
import { Storico } from './ui/Storico'
import { PaginaPiano } from './ui/PaginaPiano'
import { Impostazioni } from './ui/Impostazioni'
import { Blocco } from './ui/Blocco'
import { daDataLocale, giornoNaturale } from './data/date'
import { condividiFile, etaGiorni } from './ui/util'
import { ETA_PIANO_PROMEMORIA_GIORNI } from './domain/types'

type Tab = 'oggi' | 'storico' | 'piano' | 'impostazioni'

const TAB: Array<{ id: Tab; etichetta: string; icona: string }> = [
  { id: 'oggi', etichetta: 'Oggi', icona: '📅' },
  { id: 'storico', etichetta: 'Storico', icona: '🕘' },
  { id: 'piano', etichetta: 'Piano', icona: '📋' },
  { id: 'impostazioni', etichetta: 'Impostazioni', icona: '⚙️' },
]

export default function App() {
  const servizi = useServizi()
  const { pronto, oggi, piano, impostazioni, ricarica } = useDati()
  const [tab, setTab] = useState<Tab>('oggi')

  // ---- blocco locale: al cold start e al ritorno da background oltre il timeout ----
  const [bloccata, setBloccata] = useState<boolean | null>(null)
  const nascostaDa = useRef<number | null>(null)

  useEffect(() => {
    if (pronto && bloccata === null) setBloccata(impostazioni.bloccoAttivo)
  }, [pronto, bloccata, impostazioni.bloccoAttivo])

  useEffect(() => {
    const suVisibilita = () => {
      if (document.hidden) {
        nascostaDa.current = Date.now()
      } else if (
        impostazioni.bloccoAttivo &&
        nascostaDa.current !== null &&
        Date.now() - nascostaDa.current > impostazioni.autoLockMinuti * 60_000
      ) {
        setBloccata(true)
      }
    }
    document.addEventListener('visibilitychange', suVisibilita)
    return () => document.removeEventListener('visibilitychange', suVisibilita)
  }, [impostazioni.bloccoAttivo, impostazioni.autoLockMinuti])

  // ---- banner aggiornamento PWA (registerType: 'prompt', §1) ----
  const {
    needRefresh: [aggiornamentoPronto],
    updateServiceWorker,
  } = useRegisterSW()

  // ---- promemoria backup del lunedì (§ Impostazioni) ----
  const [promemoriaChiuso, setPromemoriaChiuso] = useState(false)
  const lunedi = pronto && giornoNaturale(daDataLocale(oggi)) === 'Lunedì'
  const backupVecchio =
    impostazioni.ultimoBackup === null || etaGiorni(impostazioni.ultimoBackup) > 7
  const mostraPromemoria = lunedi && backupVecchio && !promemoriaChiuso && pronto

  async function backupRapido() {
    await condividiFile('backup-piano-nutrizionale.json', await servizi.exporter.backupCompleto())
    setPromemoriaChiuso(true)
    await ricarica()
  }

  if (!pronto) {
    return <div className="caricamento">Piano Nutrizionale</div>
  }

  if (bloccata) {
    return <Blocco impostazioni={impostazioni} onSbloccata={() => setBloccata(false)} />
  }

  const badgePiano = piano !== null && etaGiorni(piano.caricatoIl) > ETA_PIANO_PROMEMORIA_GIORNI

  return (
    <div className="app">
      {aggiornamentoPronto && (
        <div className="banner aggiornamento">
          <span>Nuova versione disponibile</span>
          <button className="testuale" onClick={() => void updateServiceWorker(true)}>
            Aggiorna
          </button>
        </div>
      )}
      {mostraPromemoria && (
        <div className="banner promemoria">
          <span>È lunedì: l'ultimo backup ha più di 7 giorni.</span>
          <button className="testuale" onClick={() => void backupRapido()}>
            Esporta ora
          </button>
          <button className="testuale" onClick={() => setPromemoriaChiuso(true)} aria-label="Chiudi promemoria">
            ×
          </button>
        </div>
      )}

      <main className="contenuto">
        {tab === 'oggi' && <Oggi />}
        {tab === 'storico' && <Storico />}
        {tab === 'piano' && <PaginaPiano />}
        {tab === 'impostazioni' && <Impostazioni />}
      </main>

      <nav className="tab-bar">
        {TAB.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'attiva' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="tab-icona">
              {t.icona}
              {t.id === 'piano' && badgePiano && <span className="badge-punto" aria-label="Piano da aggiornare" />}
            </span>
            <span className="tab-etichetta">{t.etichetta}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
