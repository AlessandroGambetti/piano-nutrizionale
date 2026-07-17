import type { ReactNode } from 'react'

export function Dialogo({
  titolo,
  children,
  azioni,
}: {
  titolo: string
  children: ReactNode
  azioni: ReactNode
}) {
  return (
    <div className="velo" role="dialog" aria-modal="true" aria-label={titolo}>
      <div className="dialogo">
        <h3>{titolo}</h3>
        <div className="dialogo-corpo">{children}</div>
        <div className="dialogo-azioni">{azioni}</div>
      </div>
    </div>
  )
}

export function VuotoConMessaggio({ titolo, dettaglio }: { titolo: string; dettaglio?: string }) {
  return (
    <div className="vuoto">
      <p className="vuoto-titolo">{titolo}</p>
      {dettaglio && <p className="vuoto-dettaglio">{dettaglio}</p>}
    </div>
  )
}
