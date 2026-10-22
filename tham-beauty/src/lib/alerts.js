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
