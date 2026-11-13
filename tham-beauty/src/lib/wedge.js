// Scanner « clavier » (USB, Bluetooth HID, 2,4 GHz : ZKTeco, Honeywell Orbit…) : il « tape » le code très vite puis Entrée.
// On reconnaît un scan à sa vitesse (≤ 35 ms entre deux caractères) — un humain tape beaucoup plus lentement.
// Aucun réglage nécessaire : tant qu'une page utilise ce hook, un scan est reçu même si aucun champ n'est sélectionné.
import { useEffect, useRef } from 'react'
import { createWedge } from './wedgeCore.js'
import { scanOpts } from './printing.js'
import { scanBeep } from './alerts.js'

export function useWedgeScanner(onCode, enabled = true) {
  const cb = useRef(onCode)
  cb.current = onCode
  useEffect(() => {
    if (!enabled) return
    const w = createWedge(() => cb.current, undefined, scanOpts)
    window.addEventListener('keydown', w.onKey, true)
    return () => { window.removeEventListener('keydown', w.onKey, true); w.dispose() }
  }, [enabled])
}

// Scan reçu par une page qui a déjà une fonction onScan(code) → { ok, text } : on affiche le résultat en notification
export function wedgeNotify(app, onScan) {
  return (code) => {
    const r = onScan(code)
    if (scanOpts().sound) scanBeep(r?.ok !== false)
    if (r?.text) app.notify(r.text, r.ok ? undefined : 'error')
  }
}
