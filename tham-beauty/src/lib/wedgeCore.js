// Scanner « clavier » (USB, Bluetooth HID, 2,4 GHz : ZKTeco, Honeywell Orbit…) : il « tape » le code très vite puis Entrée.
// On reconnaît un scan à sa vitesse (≤ 35 ms entre deux caractères) — un humain tape beaucoup plus lentement.
// Aucun réglage nécessaire : tant qu'une page utilise ce hook, un scan est reçu même si aucun champ n'est sélectionné.

const GAP = 35 // ms max entre deux caractères d'un scan (par défaut)
const MIN = 4 // longueur minimale d'un code (par défaut)

const editable = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

// Retire du champ le 1er caractère qui y a été tapé avant qu'on sache que c'était un scan
function unleak(el, ch) {
  if (!el || !('value' in el) || !ch) return
  const v = String(el.value ?? '')
  if (!v.endsWith(ch)) return
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (!set) return
  set.call(el, v.slice(0, -1))
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

// Cœur du détecteur (testable sans navigateur) : renvoie le gestionnaire keydown. `now` = horloge en ms.
export function createWedge(getCb, now = () => performance.now(), getOpts = () => ({})) {
  let buf = '', last = 0, fast = 0, firstEl = null, firstCh = '', timer = 0
  const reset = () => { buf = ''; fast = 0; firstEl = null; firstCh = ''; clearTimeout(timer) }
  const O = () => { const o = getOpts() || {}; return { gap: o.gap || GAP, min: o.min || MIN, prefix: o.prefix || '', suffix: o.suffix || 'auto' } }
  const fire = () => {
    const o = O()
    let code = buf.trim()
    if (o.prefix && code.startsWith(o.prefix)) code = code.slice(o.prefix.length)
    reset()
    if (code.length >= o.min) getCb()(code)
  }
  const onKey = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
    const o = O()
    const t = now()
    const dt = t - last
    last = t
    if (e.key === 'Enter' || e.key === 'Tab') {
      const okKey = o.suffix === 'auto' || (o.suffix === 'enter' && e.key === 'Enter') || (o.suffix === 'tab' && e.key === 'Tab')
      if (okKey && o.suffix !== 'none' && buf.length >= o.min && fast >= buf.length - 1) { e.preventDefault(); e.stopPropagation(); fire() } else reset()
      return
    }
    if (e.key.length !== 1) return // Maj, flèches…
    if (dt > o.gap || !buf) { reset(); firstEl = e.target; firstCh = e.key } else fast++
    buf += e.key
    if (fast >= 1) {
      e.preventDefault() // la suite du scan ne s'écrit pas dans les champs
      if (fast === 1 && editable(firstEl)) unleak(firstEl, firstCh)
      clearTimeout(timer)
      timer = setTimeout(() => { if (fast >= 3 && buf.length >= o.min && (o.suffix === 'none' || o.suffix === 'auto')) fire(); else reset() }, Math.max(90, o.gap * 2)) // scanner sans Entrée final
    } else {
      clearTimeout(timer)
      timer = setTimeout(reset, 200)
    }
  }
  return { onKey, dispose: () => clearTimeout(timer) }
}

