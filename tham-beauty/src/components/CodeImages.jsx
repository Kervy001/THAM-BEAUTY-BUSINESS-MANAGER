import { useMemo } from 'react'
import { code128Clean, code128Widths, qrMatrix } from '../lib/codes.js'

// Fond blanc + traits noirs imposés (lisibles par un scanner même en mode sombre)
export function Barcode({ value, height = 46, className = '' }) {
  const widths = useMemo(() => code128Widths(value), [value])
  if (!widths.length) return null
  const quiet = 10
  const total = widths.reduce((a, b) => a + b, 0) + quiet * 2
  let x = quiet
  const bars = []
  widths.forEach((w, i) => { if (i % 2 === 0) bars.push(<rect key={i} x={x} y="0" width={w} height="100" fill="#000" />); x += w })
  return (
    <svg viewBox={`0 0 ${total} 100`} preserveAspectRatio="none" style={{ background: '#fff', height, width: '100%' }} className={className} role="img" aria-label={`Code-barres ${code128Clean(value)}`} shapeRendering="crispEdges">
      <rect width={total} height="100" fill="#fff" />{bars}
    </svg>
  )
}

export function QR({ value, size = 96, className = '' }) {
  const m = useMemo(() => { try { return qrMatrix(value) } catch { return null } }, [value])
  if (!m) return null
  const n = m.length
  const q = 4
  const cells = []
  m.forEach((row, y) => row.forEach((c, x) => { if (c) cells.push(`M${x + q},${y + q}h1v1h-1z`) }))
  return (
    <svg viewBox={`0 0 ${n + q * 2} ${n + q * 2}`} width={size} height={size} style={{ background: '#fff' }} className={className} role="img" aria-label={`Code QR ${value}`} shapeRendering="crispEdges">
      <rect width={n + q * 2} height={n + q * 2} fill="#fff" /><path d={cells.join('')} fill="#000" />
    </svg>
  )
}
