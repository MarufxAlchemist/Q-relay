import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { unpackBits } from '../lib/api'

/** Bit-fingerprint: bits reshaped into a square bitmap. Structure = non-randomness (RANDU shows stripes). */
export function Fingerprint({ b64, side = 256, label, badge, size = 180 }: { b64: string; side?: number; label?: string; badge?: React.ReactNode; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const bits = unpackBits(b64, side * side)
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(side, side)
    for (let i = 0; i < bits.length; i++) {
      const on = bits[i]
      img.data[i * 4] = on ? 34 : 8
      img.data[i * 4 + 1] = on ? 228 : 10
      img.data[i * 4 + 2] = on ? 255 : 20
      img.data[i * 4 + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
  }, [b64, side])
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 6, justifyItems: 'center' }}>
      <canvas ref={ref} width={side} height={side} style={{ width: size, height: size, imageRendering: 'pixelated', border: '1px solid var(--line-2)', borderRadius: 3 }} />
      <figcaption style={{ fontSize: 11, textAlign: 'center' }} className="mono">{label} {badge}</figcaption>
    </figure>
  )
}

/** Falling matrix-style bit stream, coloured by value. Pure canvas, no React re-renders per frame. */
export function BitRain({ bits, height = 220, speed = 1 }: { bits: number[]; height?: number; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const bitsRef = useRef(bits)
  bitsRef.current = bits
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    let raf = 0
    const fs = 13
    let cols = 0
    let drops: number[] = []
    let cursor = 0
    const resize = () => {
      c.width = c.clientWidth * devicePixelRatio
      c.height = height * devicePixelRatio
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      cols = Math.floor(c.clientWidth / fs)
      drops = Array.from({ length: cols }, () => Math.random() * -40)
    }
    resize()
    let last = performance.now()
    const draw = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      ctx.fillStyle = 'rgba(5,6,10,0.16)'
      ctx.fillRect(0, 0, c.clientWidth, height)
      ctx.font = `${fs - 1}px JetBrains Mono, monospace`
      const b = bitsRef.current
      for (let i = 0; i < cols; i++) {
        const bit = b.length ? b[cursor++ % b.length] : 0
        const y = drops[i] * fs
        ctx.fillStyle = bit ? '#FF3DA5' : '#22E4FF'
        ctx.globalAlpha = 0.9
        ctx.fillText(String(bit), i * fs, y)
        drops[i] += (dt / 16) * 0.55 * speed
        if (y > height && Math.random() > 0.96) drops[i] = Math.random() * -10
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', resize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [height, speed])
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 4 }} />
}

/** Bars for 2^n basis-state amplitudes: height = amplitude (signed), colour = sign/phase. */
export function AmplitudeBars({ re, n, height = 170, width = 600, highlightZero = false }: { re: number[]; n: number; height?: number; width?: number; highlightZero?: boolean }) {
  const N = re.length
  const maxAmp = 1
  const W = width, H = height, mid = (H - 12) / 2, bw = W / N
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(120,160,220,0.35)" />
      {re.map((v, i) => {
        const h = (Math.abs(v) / maxAmp) * (mid - 14)
        const neg = v < 0
        const col = Math.abs(v) < 1e-9 ? '#3a4a66' : neg ? '#FF3DA5' : '#22E4FF'
        return (
          <g key={i}>
            <motion.rect x={i * bw + bw * 0.12} width={Math.max(1, bw * 0.76)} rx={1.5}
              animate={{ y: neg ? mid : mid - h, height: Math.max(h, 0.5), fill: col }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              style={{ filter: highlightZero && i === 0 ? `drop-shadow(0 0 6px ${col})` : undefined }} />
            {bw >= 16 && (
              <text x={i * bw + bw / 2} y={H - 2} textAnchor="middle" fontSize={N <= 16 ? 9 : 7} fill={i === 0 ? '#FFB020' : '#56627a'} fontFamily="JetBrains Mono">
                {i.toString(2).padStart(n, '0')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Truth table as a glowing tile grid (lit = f(x)=1). Optional click handler for the game. */
export function TruthTiles({ table, n, revealed, onTile, size = 30 }: {
  table: (number | null)[]; n: number; revealed?: boolean; onTile?: (x: number) => void; size?: number
}) {
  const N = table.length
  const cols = Math.min(16, 2 ** Math.ceil(Math.log2(N) / 2))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap: 4 }}>
      {table.map((v, x) => {
        const known = v !== null && (revealed ?? true)
        const on = known && v === 1
        return (
          <motion.button key={x} onClick={onTile ? () => onTile(x) : undefined} disabled={!onTile}
            initial={false} animate={{ scale: known ? 1 : 0.94 }}
            title={`x = ${x.toString(2).padStart(n, '0')}${known ? `, f(x) = ${v}` : ''}`}
            style={{
              width: size, height: size, borderRadius: 3, cursor: onTile ? 'pointer' : 'default', padding: 0,
              border: `1px solid ${on ? '#FF3DA5' : known ? 'rgba(34,228,255,0.5)' : 'rgba(120,160,220,0.25)'}`,
              background: on ? 'rgba(255,61,165,0.35)' : known ? 'rgba(34,228,255,0.08)' : 'rgba(10,13,22,0.8)',
              boxShadow: on ? '0 0 10px rgba(255,61,165,0.6)' : 'none',
              color: on ? '#fff' : '#8b97ad', fontFamily: 'JetBrains Mono', fontSize: size > 26 ? 10 : 8,
            }}>
            {known ? v : size > 26 ? x : ''}
          </motion.button>
        )
      })}
    </div>
  )
}
