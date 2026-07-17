import { useEffect, useState } from 'react'
import type { Impostazioni } from '../domain/types'
import { hashPin } from './util'
import { verificaPasskey } from './webauthn'

export function Blocco({
  impostazioni,
  onSbloccata,
}: {
  impostazioni: Impostazioni
  onSbloccata: () => void
}) {
  const [pin, setPin] = useState('')
  const [errore, setErrore] = useState('')
  const [tentativoBiometrico, setTentativoBiometrico] = useState(false)

  async function conFaceId() {
    if (!impostazioni.passkeyId) return
    setTentativoBiometrico(true)
    const ok = await verificaPasskey(impostazioni.passkeyId)
    setTentativoBiometrico(false)
    if (ok) onSbloccata()
    else setErrore('Sblocco biometrico non riuscito: usa il PIN.')
  }

  async function conPin() {
    if (!impostazioni.pinHash || !impostazioni.pinSale) {
      onSbloccata() // stato incoerente: mai chiudere fuori l'utente dai propri dati
      return
    }
    if ((await hashPin(impostazioni.pinSale, pin)) === impostazioni.pinHash) {
      onSbloccata()
    } else {
      setErrore('PIN errato.')
      setPin('')
    }
  }

  // proponi subito Face ID all'apertura, una sola volta
  useEffect(() => {
    if (impostazioni.passkeyId) void conFaceId()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="blocco-schermo">
      <div className="blocco-contenuto">
        <p className="blocco-icona">🔒</p>
        <h2>Piano Nutrizionale</h2>
        {impostazioni.passkeyId && (
          <button className="primario" onClick={() => void conFaceId()} disabled={tentativoBiometrico}>
            {tentativoBiometrico ? 'Verifica…' : 'Sblocca con Face ID'}
          </button>
        )}
        <div className="blocco-pin">
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN"
            value={pin}
            autoFocus={!impostazioni.passkeyId}
            onChange={(e) => {
              setPin(e.target.value)
              setErrore('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void conPin()}
            aria-label="PIN di sblocco"
          />
          <button className="testuale" onClick={() => void conPin()} disabled={pin.length === 0}>
            Sblocca
          </button>
        </div>
        {errore && <p className="errore">{errore}</p>}
      </div>
    </div>
  )
}
