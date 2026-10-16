// Thème clair / sombre : « auto » suit le réglage de l'appareil tant que l'utilisateur n'a pas choisi.
import { useCallback, useEffect, useState } from 'react'

const KEY = 'tb-theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

function read() { try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' } }
function isDark(pref) { return pref === 'dark' || (pref === 'auto' && mq().matches) }
function apply(pref) {
  const d = isDark(pref)
  document.documentElement.classList.toggle('dark', d)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d ? '#0b0b0d' : '#0b0b0d')
  return d
}

export function useTheme() {
  const [pref, setPref] = useState(read)
  const [dark, setDark] = useState(() => isDark(read()))
  useEffect(() => {
    setDark(apply(pref))
    if (pref !== 'auto') return
    const m = mq()
    const h = () => setDark(apply('auto'))
    m.addEventListener?.('change', h)
    return () => m.removeEventListener?.('change', h)
  }, [pref])
  const toggle = useCallback(() => {
    const next = dark ? 'light' : 'dark'
    try { localStorage.setItem(KEY, next) } catch { /* stockage indisponible */ }
    setPref(next)
  }, [dark])
  return { dark, toggle }
}
