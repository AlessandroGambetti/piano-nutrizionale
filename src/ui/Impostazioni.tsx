import { useEffect, useRef, useState } from 'react'
import type { Piano } from '../domain/types'
import { useDati, useServizi } from './contesto'
import { condividiFile, etaGiorni, hashPin, saleCasuale } from './util'
import { creaPasskey, passkeySupportate } from './webauthn'
import { Dialogo } from './condivisi'

export function Impostazioni() {
  const servizi = useServizi()
  const { impostazioni, ricarica, pastiOggi } = useDati()
  const inputBackup = useRef<HTMLInputElement>(null)

  const [archivio, setArchivio] = useState<Piano[]>([])
  const [dialogoPin, setDialogoPin] = useState(false)
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [errorePin, setErrorePin] = useState('')
  const [confermaReset, setConfermaReset] = useState(false)
  const [nuovoChip, setNuovoChip] = useState('')
  const [messaggio, setMessaggio] = useState('')

  useEffect(() => {
    void servizi.piani.elenca().then(setArchivio)
  }, [servizi, pastiOggi, impostazioni])

  async function esportaBackup() {
    await condividiFile('backup-piano-nutrizionale.json', await servizi.exporter.backupCompleto())
    await ricarica()
  }

  async function importaBackup(file: File) {
    try {
      await servizi.exporter.ripristinaBackup(await file.text())
      setMessaggio('Backup ripristinato.')
    } catch (e) {
      setMessaggio(`Ripristino fallito: ${(e as Error).message}`)
    }
    await ricarica()
  }

  async function salvaPin() {
    if (pin1.length < 4) {
      setErrorePin('Il PIN deve avere almeno 4 cifre.')
      return
    }
    if (pin1 !== pin2) {
      setErrorePin('I due PIN non coincidono.')
      return
    }
    const sale = saleCasuale()
    await servizi.impostazioni.scrivi({
      ...impostazioni,
      bloccoAttivo: true,
      pinSale: sale,
      pinHash: await hashPin(sale, pin1),
    })
    setDialogoPin(false)
    setPin1('')
    setPin2('')
    setErrorePin('')
    await ricarica()
  }

  async function configuraFaceId() {
    const id = await creaPasskey()
    if (id) {
      await servizi.impostazioni.scrivi({ ...impostazioni, passkeyId: id })
      setMessaggio('Face ID configurato.')
    } else {
      setMessaggio('Face ID non disponibile su questo dispositivo: resta attivo il PIN.')
    }
    await ricarica()
  }

  async function disattivaBlocco() {
    await servizi.impostazioni.scrivi({ ...impostazioni, bloccoAttivo: false })
    await ricarica()
  }

  async function salvaTimeout(minuti: number) {
    await servizi.impostazioni.scrivi({ ...impostazioni, autoLockMinuti: minuti })
    await ricarica()
  }

  async function rimuoviChip(chip: string) {
    await servizi.impostazioni.scrivi({
      ...impostazioni,
      chips: impostazioni.chips.filter((c) => c !== chip),
    })
    await ricarica()
  }

  async function aggiungiChip() {
    const chip = nuovoChip.trim()
    if (!chip || impostazioni.chips.includes(chip)) return
    await servizi.impostazioni.scrivi({ ...impostazioni, chips: [...impostazioni.chips, chip] })
    setNuovoChip('')
    await ricarica()
  }

  async function ripristinaPiano(pianoId: string) {
    await servizi.piani.attiva(pianoId)
    await ricarica()
  }

  const etaBackup = impostazioni.ultimoBackup ? etaGiorni(impostazioni.ultimoBackup) : null

  return (
    <div className="pagina">
      <header className="intestazione">
        <h2>Impostazioni</h2>
      </header>

      {messaggio && (
        <p className="messaggio" onClick={() => setMessaggio('')}>
          {messaggio}
        </p>
      )}

      <section className="sezione">
        <h3>Backup</h3>
        <p className="sottotitolo">
          {impostazioni.ultimoBackup
            ? `Ultimo backup: ${new Date(impostazioni.ultimoBackup).toLocaleString('it-IT')} (${etaBackup === 0 ? 'oggi' : `${etaBackup} giorni fa`})`
            : 'Nessun backup ancora eseguito.'}
        </p>
        <p className="suggerimento">
          iOS può cancellare i dati delle app web non usate: esporta il backup almeno una volta a
          settimana.
        </p>
        <div className="azioni-riga">
          <button className="primario compatto" onClick={() => void esportaBackup()}>
            Esporta backup
          </button>
          <button className="testuale" onClick={() => inputBackup.current?.click()}>
            Importa backup
          </button>
          <input
            ref={inputBackup}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importaBackup(f)
              e.target.value = ''
            }}
          />
        </div>
      </section>

      <section className="sezione">
        <h3>Blocco app</h3>
        {!impostazioni.bloccoAttivo && (
          <>
            <p className="suggerimento">
              Richiede Face ID o PIN all'apertura e al ritorno in primo piano. Tutto locale, nessun
              account.
            </p>
            <button className="primario compatto" onClick={() => setDialogoPin(true)}>
              Attiva blocco
            </button>
          </>
        )}
        {impostazioni.bloccoAttivo && (
          <>
            <p className="sottotitolo">
              Blocco attivo · {impostazioni.passkeyId ? 'Face ID + PIN' : 'solo PIN'}
            </p>
            <label className="campo">
              Auto-blocco dopo{' '}
              <select
                value={impostazioni.autoLockMinuti}
                onChange={(e) => void salvaTimeout(Number(e.target.value))}
              >
                {[1, 5, 10, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <div className="azioni-riga">
              {!impostazioni.passkeyId && passkeySupportate() && (
                <button className="testuale" onClick={() => void configuraFaceId()}>
                  Configura Face ID
                </button>
              )}
              <button className="testuale" onClick={() => setDialogoPin(true)}>
                Cambia PIN
              </button>
              <button className="testuale distruttivo" onClick={() => void disattivaBlocco()}>
                Disattiva
              </button>
            </div>
          </>
        )}
      </section>

      <section className="sezione">
        <h3>Chip delle note</h3>
        <p className="suggerimento">I pasti già registrati conservano i chip con cui furono salvati.</p>
        <div className="chips">
          {impostazioni.chips.map((chip) => (
            <span key={chip} className="chip statico">
              {chip}
              <button className="rimuovi-chip" onClick={() => void rimuoviChip(chip)} aria-label={`Rimuovi ${chip}`}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="azioni-riga">
          <input
            value={nuovoChip}
            onChange={(e) => setNuovoChip(e.target.value)}
            placeholder="Nuovo chip"
            onKeyDown={(e) => e.key === 'Enter' && void aggiungiChip()}
          />
          <button className="testuale" onClick={() => void aggiungiChip()}>
            Aggiungi
          </button>
        </div>
      </section>

      <section className="sezione">
        <h3>Piani archiviati</h3>
        {archivio.length === 0 && <p className="sottotitolo">Nessun piano caricato.</p>}
        {archivio.map((p) => (
          <div key={p.pianoId} className="riga-archivio">
            <div>
              <b>{p.nomeFile}</b>
              <p className="sottotitolo">
                {new Date(p.caricatoIl).toLocaleDateString('it-IT')}
                {p.attivo && ' · attivo'}
              </p>
            </div>
            {!p.attivo && (
              <button className="testuale" onClick={() => void ripristinaPiano(p.pianoId)}>
                Ripristina
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="sezione">
        <h3>Rete di sicurezza</h3>
        <button className="testuale distruttivo" onClick={() => setConfermaReset(true)}>
          Reset settimana
        </button>
      </section>

      {dialogoPin && (
        <Dialogo
          titolo={impostazioni.bloccoAttivo ? 'Cambia PIN' : 'Attiva blocco'}
          azioni={
            <>
              <button
                className="testuale"
                onClick={() => {
                  setDialogoPin(false)
                  setPin1('')
                  setPin2('')
                  setErrorePin('')
                }}
              >
                Annulla
              </button>
              <button className="primario compatto" onClick={() => void salvaPin()}>
                Salva
              </button>
            </>
          }
        >
          <p className="suggerimento">
            Il PIN è il fallback quando Face ID non è disponibile. Non è recuperabile: se lo
            dimentichi servirà reinstallare l'app (i dati si recuperano dal backup).
          </p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="Nuovo PIN (min 4 cifre)"
            value={pin1}
            onChange={(e) => setPin1(e.target.value)}
          />
          <input
            type="password"
            inputMode="numeric"
            placeholder="Ripeti PIN"
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
          {errorePin && <p className="errore">{errorePin}</p>}
        </Dialogo>
      )}

      {confermaReset && (
        <Dialogo
          titolo="Reset settimana?"
          azioni={
            <>
              <button className="testuale" onClick={() => setConfermaReset(false)}>
                Annulla
              </button>
              <button
                className="primario compatto"
                onClick={() => {
                  void (async () => {
                    await servizi.motore.resetManuale()
                    setConfermaReset(false)
                    await ricarica()
                  })()
                }}
              >
                Reset
              </button>
            </>
          }
        >
          <p>Pool e conferme della settimana tornano come a lunedì. Lo storico non si tocca.</p>
        </Dialogo>
      )}
    </div>
  )
}
