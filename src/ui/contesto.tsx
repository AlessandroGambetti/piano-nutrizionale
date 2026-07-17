import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { DataLocale, Impostazioni, PastoConsumato, Piano, StatoSettimana } from '../domain/types'
import type { Servizi } from '../servizi'
import { IMPOSTAZIONI_DEFAULT } from '../data/repos'
import { dataLocale } from '../data/date'

export interface DatiApp {
  pronto: boolean
  oggi: DataLocale
  piano: Piano | null
  stato: StatoSettimana | null
  pastiOggi: PastoConsumato[]
  impostazioni: Impostazioni
  ricarica: () => Promise<void>
}

const CtxServizi = createContext<Servizi | null>(null)
const CtxDati = createContext<DatiApp | null>(null)

export function ProviderApp({ servizi, children }: { servizi: Servizi; children: ReactNode }) {
  const [dati, setDati] = useState<Omit<DatiApp, 'ricarica'>>({
    pronto: false,
    oggi: dataLocale(new Date()),
    piano: null,
    stato: null,
    pastiOggi: [],
    impostazioni: { ...IMPOSTAZIONI_DEFAULT },
  })

  const ricarica = useCallback(async () => {
    const adesso = new Date()
    // allinea() gestisce anche il reset di settimana: è l'UNICO punto di ricalcolo
    const stato = await servizi.motore.allinea(adesso)
    const oggi = dataLocale(adesso)
    const [piano, pastiOggi, impostazioni] = await Promise.all([
      servizi.piani.pianoAttivo(),
      servizi.pasti.perData(oggi),
      servizi.impostazioni.leggi(),
    ])
    setDati({ pronto: true, oggi, piano, stato, pastiOggi, impostazioni })
  }, [servizi])

  useEffect(() => {
    void ricarica()
  }, [ricarica])

  // §3: "oggi" e settimana ISO si ricalcolano anche al ritorno in foreground,
  // non solo al cold start — una PWA iOS riprende dalla memoria.
  useEffect(() => {
    const suRitorno = () => {
      if (!document.hidden) void ricarica()
    }
    document.addEventListener('visibilitychange', suRitorno)
    window.addEventListener('focus', suRitorno)
    return () => {
      document.removeEventListener('visibilitychange', suRitorno)
      window.removeEventListener('focus', suRitorno)
    }
  }, [ricarica])

  return (
    <CtxServizi.Provider value={servizi}>
      <CtxDati.Provider value={{ ...dati, ricarica }}>{children}</CtxDati.Provider>
    </CtxServizi.Provider>
  )
}

export function useServizi(): Servizi {
  const s = useContext(CtxServizi)
  if (!s) throw new Error('useServizi fuori da ProviderApp')
  return s
}

export function useDati(): DatiApp {
  const d = useContext(CtxDati)
  if (!d) throw new Error('useDati fuori da ProviderApp')
  return d
}
