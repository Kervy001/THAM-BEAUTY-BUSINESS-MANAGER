import { useCallback, useEffect, useRef, useState } from 'react'
import { getLockOpts, hasPin } from './security.js'

// Verrouillage automatique : à l'ouverture, après inactivité, ou quand on quitte l'application.
// Événements internes : 'tb-lock-now' (verrouiller tout de suite) et 'tb-security-changed' (PIN créé / retiré).
export function useAutoLock(uid, policy) {
  const [locked, setLocked] = useState(false)
  const [version, setVersion] = useState(0)
  const last = useRef(Date.now())
  const hiddenAt = useRef(0)
  const booted = useRef('')
  const lockedRef = useRef(false)
  lockedRef.current = locked
  const opts = () => getLockOpts(uid, policy)

  useEffect(() => {
    if (!uid) { booted.current = ''; setLocked(false); return }
    if (booted.current === uid) return
    booted.current = uid
    if (hasPin(uid) && opts().onOpen) setLocked(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  useEffect(() => {
    if (!uid) return
    const touch = () => { if (!lockedRef.current) last.current = Date.now() }
    const lockNow = () => { if (hasPin(uid)) setLocked(true) }
    const changed = () => setVersion((v) => v + 1)
    const vis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt.current = Date.now(); return }
      if (lockedRef.current || !hasPin(uid)) return
      const m = opts().minutes
      const away = Date.now() - (hiddenAt.current || Date.now())
      if ((m === 0 && away > 3000) || (m > 0 && away > m * 60000)) setLocked(true)
      else last.current = Date.now()
    }
    const tick = setInterval(() => {
      const m = opts().minutes
      if (!lockedRef.current && hasPin(uid) && m > 0 && Date.now() - last.current > m * 60000) setLocked(true)
    }, 10000)
    const evs = ['pointerdown', 'keydown', 'touchstart', 'scroll']
    evs.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }))
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('tb-lock-now', lockNow)
    window.addEventListener('tb-security-changed', changed)
    return () => {
      clearInterval(tick)
      evs.forEach((e) => window.removeEventListener(e, touch, { capture: true }))
      document.removeEventListener('visibilitychange', vis)
      window.removeEventListener('tb-lock-now', lockNow)
      window.removeEventListener('tb-security-changed', changed)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, policy?.lockMinutes])

  const unlock = useCallback(() => { last.current = Date.now(); setLocked(false) }, [])
  return { locked, unlock, version, pinSet: uid ? hasPin(uid) : false }
}
