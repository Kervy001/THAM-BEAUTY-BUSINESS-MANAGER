// Impression directe par câble USB (WebUSB) vers une imprimante thermique ESC/POS.
// Chrome (Android avec adaptateur OTG, Chromebook, ordinateur). Pas Safari / iPhone.
// Sous Windows, le pilote d'imprimante installé empêche souvent WebUSB d'accéder à l'appareil (voir message d'erreur).
const KEY = 'tb-usb'
let dev = null, iface = null, ep = null

export const usbSupported = () => typeof navigator !== 'undefined' && !!navigator.usb && (typeof window === 'undefined' || window.isSecureContext !== false)
export const usbName = () => (dev && (dev.productName || `USB ${dev.vendorId.toString(16)}:${dev.productId.toString(16)}`)) || ''
export async function usbForget() { try { if (dev?.opened) await dev.close() } catch { /* rien */ } dev = null; iface = null; ep = null }

const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } }
const remember = (d) => { try { localStorage.setItem(KEY, JSON.stringify({ v: d.vendorId, p: d.productId })) } catch { /* rien */ } }

// Cherche une interface avec un point de sortie « bulk OUT » (préférence : classe imprimante 7)
function findOut(d) {
  let best = null
  for (const cfg of d.configurations || []) {
    for (const itf of cfg.interfaces) {
      for (const alt of itf.alternates) {
        const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
        if (out && (!best || alt.interfaceClass === 7)) best = { cfg: cfg.configurationValue, num: itf.interfaceNumber, alt: alt.alternateSetting, ep: out.endpointNumber }
      }
    }
  }
  return best
}

async function connect(pick) {
  if (!usbSupported()) throw new Error('USB indisponible ici : utilisez Chrome sur Android, Chromebook ou ordinateur (pas Safari / iPhone).')
  if (!dev || pick) {
    let found = null
    if (!pick) {
      const mem = remembered()
      const list = await navigator.usb.getDevices()
      found = (mem && list.find((x) => x.vendorId === mem.v && x.productId === mem.p)) || null
    }
    dev = found || (await navigator.usb.requestDevice({ filters: [] }))
    iface = null; ep = null
  }
  if (!dev.opened) await dev.open()
  if (!iface) {
    const f = findOut(dev)
    if (!f) throw new Error('Cette imprimante n’expose pas de port d’impression USB utilisable (le câble USB-C sert peut-être seulement à la recharger).')
    if (!dev.configuration || dev.configuration.configurationValue !== f.cfg) await dev.selectConfiguration(f.cfg)
    try { await dev.claimInterface(f.num) } catch (e) {
      throw new Error('Impossible d’accéder à l’imprimante par USB (' + (e?.message || 'accès refusé') + '). Sous Windows, le pilote de l’imprimante bloque WebUSB : utilisez le Bluetooth ou la fenêtre d’impression.')
    }
    if (f.alt) { try { await dev.selectAlternateInterface(f.num, f.alt) } catch { /* rien */ } }
    iface = f.num; ep = f.ep
    remember(dev)
  }
  return ep
}

// bytes : Uint8Array ESC/POS. pick=true force le choix de l'appareil (fenêtre USB du navigateur).
export async function usbPrint(bytes, { pick = false, chunk = 512 } = {}) {
  let n
  try { n = await connect(pick) } catch (e) {
    if (e && e.name === 'NotFoundError') throw new Error('Aucune imprimante choisie.')
    throw e
  }
  try {
    for (let i = 0; i < bytes.length; i += chunk) await dev.transferOut(n, bytes.slice(i, i + chunk))
  } catch (e) {
    iface = null; ep = null
    throw new Error('Connexion USB interrompue. Vérifiez le câble et que l’imprimante est allumée, puis réessayez.')
  }
}
