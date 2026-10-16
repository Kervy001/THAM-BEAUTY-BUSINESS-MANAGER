// Verrouillage de l'application : code PIN + empreinte / visage du téléphone (WebAuthn).
// Tout reste SUR L'APPAREIL (localStorage) : le PIN n'est jamais envoyé ni stocké en ligne, seulement un hachage salé.
// C'est un verrou de confort et de confidentialité : il protège l'appli ouverte sur le téléphone, il ne remplace pas le mot de passe du compte.
const enc = new TextEncoder()
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const k = (name, uid) => `tb-${name}-${uid}`
const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* stockage indisponible */ } }

async function derive(pin, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256))
}

export const PIN_RE = /^\d{4,6}$/
export const hasPin = (uid) => !!read(k('pin', uid))
export const pinLength = (uid) => read(k('pin', uid))?.len || 4
export async function setPin(uid, pin) {
  if (!PIN_RE.test(pin)) throw new Error('Le PIN doit avoir 4 à 6 chiffres.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iter = 150000
  write(k('pin', uid), { salt: b64(salt), iter, len: pin.length, hash: await derive(pin, salt, iter) })
}
export async function checkPin(uid, pin) {
  const r = read(k('pin', uid))
  if (!r) return false
  return (await derive(pin, unb64(r.salt), r.iter)) === r.hash
}
export function removePin(uid) { try { localStorage.removeItem(k('pin', uid)); localStorage.removeItem(k('bio', uid)) } catch { /* rien */ } }

// ---- empreinte / visage (clé d'accès WebAuthn de l'appareil)
export async function bioSupported() {
  try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) } catch { return false }
}
export const hasBio = (uid) => !!read(k('bio', uid))
export function removeBio(uid) { try { localStorage.removeItem(k('bio', uid)) } catch { /* rien */ } }
export async function enableBio(uid, name) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'THAM BEAUTY' },
    user: { id: enc.encode(String(uid)).slice(0, 64), name: name || String(uid), displayName: name || 'Utilisateur' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000
  } })
  write(k('bio', uid), { id: b64(cred.rawId) })
}
export async function unlockBio(uid) {
  const r = read(k('bio', uid))
  if (!r) return false
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(r.id), transports: ['internal'] }],
      userVerification: 'required', timeout: 60000
    } })
    return true
  } catch { return false }
}

// ---- options de verrouillage (par utilisateur, sur l'appareil)
export const LOCK_CHOICES = [[0, 'Dès que je quitte l’application'], [1, 'Après 1 minute'], [5, 'Après 5 minutes'], [15, 'Après 15 minutes'], [30, 'Après 30 minutes'], [-1, 'Jamais (seulement à l’ouverture)']]
export const getLockOpts = (uid, defaults = {}) => ({ minutes: defaults.lockMinutes ?? 5, onOpen: true, ...(read(k('lock', uid)) || {}) })
export const setLockOpts = (uid, o) => write(k('lock', uid), o)
