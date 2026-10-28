import { motion } from 'framer-motion'
import { CLASSICAL_BOUND, useStore } from '../store/useStore'
import type { Source } from '../lib/api'

/** Big tactile noise slider (global). */
export function NoiseSlider({ compact = false }: { compact?: boolean }) {
  const noise = useStore((s) => s.noise)
  const setNoise = useStore((s) => s.setNoise)
  const p2 = 0.5 * noise
  const col = noise < 0.35 ? 'var(--cyan)' : noise < 0.7 ? 'var(--amber)' : 'var(--red)'
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: compact ? 200 : 280 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="lbl">Noise</span>
        <span className="mono" style={{ color: col, fontSize: compact ? 12 : 15 }}>{(noise * 100).toFixed(0)}%</span>
      </div>
      <input type="range" min={0} max={1} step={0.01} value={noise} onChange={(e) => setNoise(+e.target.value)}
        style={{ accentColor: col }} aria-label="noise level" />
      {!compact && (
        <div className="mono dim" style={{ fontSize: 10 }}>
          depolarizing p₂={p2.toFixed(3)} · p₁={(p2 / 10).toFixed(4)} · readout={(p2 / 5).toFixed(3)}
        </div>
      )}
    </div>
  )
}

/** Radial fidelity gauge with the 2/3 classical limit marked. */
export function FidelityGauge({ value, size = 150, label = 'Fidelity' }: { value: number | null; size?: number; label?: string }) {
  const r = size / 2 - 12
  const start = Math.PI * 0.75, sweep = Math.PI * 1.5
  const pt = (f: number) => {
    const a = start + sweep * f
    return [size / 2 + r * Math.cos(a), size / 2 + r * Math.sin(a)]
  }
  const arc = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0), [x1, y1] = pt(f1)
    return `M${x0},${y0} A${r},${r} 0 ${sweep * (f1 - f0) > Math.PI ? 1 : 0} 1 ${x1},${y1}`
  }
  // the scale shows F in [0.5, 1]: 0.5 = random guessing, 1 = perfect
  const toF = (f: number) => Math.max(0, Math.min(1, (f - 0.5) / 0.5))
  const v = value ?? 0.5
  const quantum = value !== null && value > CLASSICAL_BOUND
  const col = value === null ? '#5B7268' : quantum ? (v > 0.9 ? '#B6FF6A' : '#4DFFA6') : '#FF5470'
  const [bx, by] = pt(toF(CLASSICAL_BOUND))
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={arc(0, 1)} stroke="rgba(110, 200, 160,0.18)" strokeWidth={size < 60 ? 5 : 9} fill="none" strokeLinecap="round" />
        <path d={arc(0, toF(CLASSICAL_BOUND))} stroke="rgba(255, 84, 112,0.25)" strokeWidth={size < 60 ? 5 : 9} fill="none" />
        <path d={arc(0, Math.max(0.001, toF(v)))} stroke={col} strokeWidth={size < 60 ? 5 : 9} fill="none" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${col})` }} />
        <line x1={bx} y1={by} x2={size / 2 + (bx - size / 2) * 0.72} y2={size / 2 + (by - size / 2) * 0.72} stroke="#FF8A5B" strokeWidth={2} />
        {size >= 60 && <text x={size / 2 + (bx - size / 2) * 0.6} y={size / 2 + (by - size / 2) * 0.6 + 3} fontSize="9" fill="#FF8A5B" textAnchor="middle" fontFamily="JetBrains Mono">2/3</text>}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div className="mono" style={{ fontSize: size / 5.2, color: col, textShadow: `0 0 12px ${col}` }}>{value === null ? '—' : value.toFixed(3)}</div>
          {size >= 60 && <div className="lbl" style={{ fontSize: 9 }}>{label}</div>}
          {value !== null && size >= 60 && (
            <div className="mono" style={{ fontSize: 9, color: quantum ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>
              {quantum ? 'QUANTUM REGIME' : 'CLASSICAL REGIME'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function SourceBadge({ source }: { source: Source | string }) {
  return <span className={`badge ${source}`}>{source}</span>
}

export function Seg<T extends string | number>({ value, options, onChange, labels }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Record<string, string>
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o)} className={o === value ? 'on' : ''} onClick={() => onChange(o)}>{labels?.[String(o)] ?? String(o)}</button>
      ))}
    </div>
  )
}

export function BitLamp({ bit, label }: { bit: number | null; label: string }) {
  const on = bit === 1
  const col = bit === null ? '#233A30' : on ? '#F5C84B' : '#4DFFA6'
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
      <motion.div animate={{ boxShadow: bit === null ? 'none' : `0 0 22px ${col}` }}
        style={{ width: 44, height: 44, borderRadius: 8, border: `2px solid ${col}`, display: 'grid', placeItems: 'center',
          fontFamily: 'JetBrains Mono', fontSize: 22, color: col, background: bit === null ? 'transparent' : `${col}22` }}>
        {bit ?? '·'}
      </motion.div>
      <span className="lbl" style={{ fontSize: 9 }}>{label}</span>
    </div>
  )
}
