// Petits signaux pour les alertes : bip + vibration, et notification système (Android/PC) si l'utilisateur l'a autorisée.
export function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.frequency.value = 880; g.gain.value = 0.08
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18)
    setTimeout(() => ctx.close(), 400)
  } catch { /* silencieux */ }
  try { navigator.vibrate?.([80, 40, 80]) } catch { /* silencieux */ }
}

export const canSystemNotify = () => typeof window !== 'undefined' && 'Notification' in window
export const systemNotifyState = () => (canSystemNotify() ? Notification.permission : 'unsupported')
export async function askSystemNotify() { return canSystemNotify() ? Notification.requestPermission() : 'unsupported' }

export function systemNotify(title, body, tag = 'tb-sale') {
  try {
    if (!canSystemNotify() || Notification.permission !== 'granted') return
    const opts = { body, icon: `${import.meta.env.BASE_URL}logo-sm.webp`, tag }
    if (navigator.serviceWorker?.ready) navigator.serviceWorker.ready.then((r) => r.showNotification(title, opts)).catch(() => new Notification(title, opts))
    else new Notification(title, opts)
  } catch { /* silencieux */ }
}

// Bip de scan : un son court et aigu = code reconnu ; deux sons graves = code inconnu / stock épuisé
export function scanBeep(ok = true) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    const tone = (freq, at, dur) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = freq; g.gain.value = 0.09; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + dur) }
    if (ok) tone(1400, 0, 0.09)
    else { tone(280, 0, 0.14); tone(220, 0.18, 0.2) }
    setTimeout(() => ctx.close(), 700)
  } catch { /* silencieux */ }
  try { navigator.vibrate?.(ok ? 30 : [60, 40, 60]) } catch { /* silencieux */ }
}
