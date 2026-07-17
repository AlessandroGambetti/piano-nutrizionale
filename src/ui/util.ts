import type { DataLocale, PastoConsumato } from '../domain/types'
import { daDataLocale } from '../data/date'

/** Export file: Web Share come via primaria (limiti noti di a[download] su iOS Safari, §1). */
export async function condividiFile(nome: string, blob: Blob): Promise<void> {
  const file = new File([blob], nome, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return // annullato dall'utente
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function hashPin(sale: string, pin: string): Promise<string> {
  const dati = new TextEncoder().encode(`${sale}:${pin}`)
  const hash = await crypto.subtle.digest('SHA-256', dati)
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function saleCasuale(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

const FORMATO_DATA = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
export function dataEstesa(data: DataLocale): string {
  const testo = FORMATO_DATA.format(daDataLocale(data))
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

export function etaGiorni(timestampIso: string): number {
  return Math.floor((Date.now() - new Date(timestampIso).getTime()) / 86_400_000)
}

/** Record "vivi" della giornata (da piano, non storicizzati da un cambio giornata). */
export function pastiDaPiano(records: PastoConsumato[]): PastoConsumato[] {
  return records.filter((r) => !r.fuoriPiano && !r.giornataPrecedente)
}
