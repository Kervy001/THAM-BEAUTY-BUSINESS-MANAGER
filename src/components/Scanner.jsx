import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui.jsx'
import Icon from './Icon.jsx'

// Scanner de codes-barres / QR avec la caméra (Chrome Android : détecteur intégré, rapide et sans Internet).
// Saisie manuelle toujours disponible : fonctionne aussi avec une douchette USB / Bluetooth (elle « tape » le code + Entrée).
// onDetect(code) peut renvoyer un message (texte) affiché sous la caméra. continuous : reste ouvert pour scanner plusieurs articles.
const hasDetector = typeof window !== 'undefined' && 'BarcodeDetector' in window

function beep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.frequency.value = 1040; g.gain.value = 0.08
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.09)
    setTimeout(() => ctx.close(), 250)
  } catch { /* silencieux */ }
  try { navigator.vibrate?.(50) } catch { /* silencieux */ }
}

function loadJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
    s.onload = () => resolve(window.jsQR); s.onerror = () => reject(new Error('jsqr'))
    document.head.appendChild(s)
  })
}

export default function Scanner({ title = 'Scanner un code', continuous = false, onDetect, onClose }) {
  const video = useRef(null)
  const cb = useRef(onDetect)
  cb.current = onDetect
  const [state, setState] = useState('start') // start | ready | error
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [manual, setManual] = useState('')
  const last = useRef({ code: '', at: 0 })

  async function handle(code) {
    const now = Date.now()
    if (code === last.current.code && now - last.current.at < 1800) return // évite de compter 10 fois le même scan
    last.current = { code, at: now }
    beep()
    let res
    try { res = await cb.current(code) } catch (e) { res = { ok: false, text: e.message || 'Erreur' } }
    if (typeof res === 'string') res = { ok: true, text: res }
    if (res) setMsg(res)
    if (!continuous) onClose()
  }

  useEffect(() => {
    let stream; let timer; let stopped = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setErr('La caméra n’est pas disponible ici (HTTPS requis). Utilisez la saisie manuelle ci-dessous.'); setState('error'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = video.current
        v.srcObject = stream
        await v.play()
        setState('ready')
        let detector = null
        let jsqr = null
        if (hasDetector) { detector = new window.BarcodeDetector() } else { try { jsqr = await loadJsQR() } catch { /* pas de repli */ } }
        if (!detector && !jsqr) { setErr('Ce navigateur ne sait pas lire les codes avec la caméra. Utilisez Chrome sur Android, ou la saisie manuelle.'); return }
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        const tick = async () => {
          if (stopped) return
          try {
            if (v.readyState >= 2 && v.videoWidth) {
              if (detector) {
                const r = await detector.detect(v)
                if (r.length && r[0].rawValue) await handle(r[0].rawValue)
              } else {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight
                ctx.drawImage(v, 0, 0)
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
                const r = jsqr(img.data, img.width, img.height)
                if (r?.data) await handle(r.data)
              }
            }
          } catch { /* image pas encore prête */ }
          timer = setTimeout(tick, 220)
        }
        tick()
      } catch (e) {
        setErr(e?.name === 'NotAllowedError' ? 'Accès à la caméra refusé. Autorisez la caméra dans les réglages du navigateur, ou utilisez la saisie manuelle.' : 'Impossible d’ouvrir la caméra. Utilisez la saisie manuelle.')
        setState('error')
      }
    }
    start()
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function submitManual(e) {
    e.preventDefault()
    e.stopPropagation() // ne pas déclencher le formulaire parent (ex. « Valider la vente »)
    const c = manual.trim()
    if (!c) return
    setManual('')
    last.current = { code: '', at: 0 }
    handle(c)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {state !== 'error' && (
          <div className="relative overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '4 / 3' }}>
            <video ref={video} playsInline muted className="h-full w-full object-cover" />
            {state === 'ready' && <div className="pointer-events-none absolute inset-[12%] rounded-2xl border-2 border-gold-300/80" />}
            {state === 'start' && <div className="absolute inset-0 grid place-items-center text-sm text-gold-200">Ouverture de la caméra…</div>}
          </div>
        )}
        {err && <div className="rounded-xl border border-gold-300 bg-gold-100/50 p-3 text-sm">{err}</div>}
        {msg && <div className={'rounded-xl p-3 text-sm font-medium ' + (msg.ok === false ? 'border border-blush-100 bg-blush-50 text-blush-600' : 'border border-emerald-200 bg-emerald-50 text-emerald-700')}>{msg.text}</div>}
        <form onSubmit={submitManual} className="flex gap-2">
          <input className="input" placeholder="Saisir / scanner un code (douchette)…" value={manual} onChange={(e) => setManual(e.target.value)} autoCapitalize="characters" autoComplete="off" />
          <button className="btn-primary shrink-0">OK</button>
        </form>
        {continuous && <button type="button" className="btn-gold w-full" onClick={onClose}><Icon name="check" size={16} />Terminer</button>}
      </div>
    </Modal>
  )
}
