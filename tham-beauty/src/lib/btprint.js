// Impression directe par Bluetooth Low Energy (Web Bluetooth) vers une imprimante thermique ESC/POS.
// Marche sur Chrome (Android, Chromebook, ordinateur). Pas sur iPhone/iPad (Safari). Ne marche qu'avec les imprimantes BLE.
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '00001800-0000-1000-8000-00805f9b34fb'
]
let dev = null, chr = null

export const btSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth && (typeof window === 'undefined' || window.isSecureContext !== false)
export const btName = () => (dev && dev.name) || ''
export function btForget() { try { dev?.gatt?.connected && dev.gatt.disconnect() } catch { /* rien */ } dev = null; chr = null }

async function connect(pick) {
  if (!btSupported()) throw new Error('Bluetooth indisponible ici : utilisez Chrome sur Android, Chromebook ou ordinateur (pas Safari / iPhone).')
  if (!dev || pick) {
    dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES })
    chr = null
  }
  if (!dev.gatt.connected || !chr) {
    chr = null
    const server = await dev.gatt.connect()
    const services = await server.getPrimaryServices()
    let best = null
    for (const s of services) {
      let cs = []
      try { cs = await s.getCharacteristics() } catch { cs = [] }
      for (const c of cs) {
        if (c.properties.writeWithoutResponse || c.properties.write) {
          if (!best || (!best.properties.writeWithoutResponse && c.properties.writeWithoutResponse)) best = c
        }
      }
    }
    if (!best) throw new Error('Cette imprimante n’accepte pas l’impression Bluetooth BLE (elle utilise sans doute le Bluetooth classique). Utilisez son application ou la fenêtre d’impression.')
    chr = best
  }
  return chr
}

// bytes : Uint8Array ESC/POS. pick=true force le choix d'une imprimante (fenêtre Bluetooth du navigateur).
export async function btPrint(bytes, { pick = false, chunk = 20, delay = 25 } = {}) {
  let c
  try { c = await connect(pick) } catch (e) {
    if (e && e.name === 'NotFoundError') throw new Error('Aucune imprimante choisie.')
    throw e
  }
  const noResp = !!c.properties.writeWithoutResponse
  try {
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.slice(i, i + chunk)
      if (noResp) await c.writeValueWithoutResponse(part)
      else await c.writeValue(part)
      if (delay) await new Promise((r) => setTimeout(r, delay))
    }
  } catch (e) {
    chr = null // connexion perdue : reconnexion à la prochaine impression
    throw new Error('Connexion Bluetooth interrompue. Allumez l’imprimante, approchez-vous, puis réessayez.')
  }
}
