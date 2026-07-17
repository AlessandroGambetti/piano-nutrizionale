// Blocco locale con passkey (Face ID/Touch ID). Nessun server: il gesto biometrico
// del sistema È la verifica; se la piattaforma non supporta, si degrada al solo PIN (§1).

export function passkeySupportate(): boolean {
  return typeof window.PublicKeyCredential !== 'undefined'
}

export async function creaPasskey(): Promise<string | null> {
  if (!passkeySupportate()) return null
  try {
    const credenziale = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Piano Nutrizionale' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'piano-nutrizionale',
          displayName: 'Piano Nutrizionale',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null
    if (!credenziale) return null
    return btoa(String.fromCharCode(...new Uint8Array(credenziale.rawId)))
  } catch {
    return null
  }
}

export async function verificaPasskey(idBase64: string): Promise<boolean> {
  try {
    const id = Uint8Array.from(atob(idBase64), (c) => c.charCodeAt(0))
    const credenziale = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })
    return credenziale !== null
  } catch {
    return false
  }
}
