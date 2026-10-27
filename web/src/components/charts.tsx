import { useMemo } from 'react'

// Minimal hand-rolled SVG charts in the HUD style (no chart library).

export interface Series { name: string; x: number[]; y: number[]; color: string; dashed?: boolean; width?: number }

interface LineProps {
  series: Series[]
  width?: number
  height?: number
  xLabel?: string
  yLabel?: string
  yMin?: number
  yMax?: number
  logY?: boolean
  hLines?: { y: number; label: string; color: string }[]
  markers?: { x: number; y: number; label: string; color: string }[]
  band?: { x: number[]; lo: number[]; hi: number[]; color: string }
  legend?: boolean
  legendPos?: 'tl' | 'tr' | 'bl' | 'br'
  vLine?: { x: number; color: string; label?: string }
}

const M = { l: 48, r: 10, t: 10, b: 32 }

function ticks(min: number, max: number, n = 5): number[] {
  const span = max - min || 1
  const step = Math.pow(10, Math.floor(Math.log10(span / n)))
  const err = (n * step) / span
  const s = step * (err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1)
  const out: number[] = []
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(+v.toFixed(10))
  return out
}

const fmt = (v: number) => (Math.abs(v) >= 10000 ? v.toExponential(0) : Math.abs(v) < 0.01 && v !== 0 ? v.toExponential(0) : +v.toFixed(3) + '')

export function LineChart({ series, width = 460, height = 220, xLabel, yLabel, yMin, yMax, logY, hLines, markers, band, legend = true, legendPos = 'tl', vLine }: LineProps) {
  const all = series.flatMap((s) => s.x.map((x, i) => [x, s.y[i]] as const)).filter(([, y]) => y != null && isFinite(y))
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  if (band) ys.push(...band.lo, ...band.hi)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const tf = (v: number) => (logY ? Math.log10(Math.max(v, 1e-12)) : v)
  let y0 = yMin ?? Math.min(...ys), y1 = yMax ?? Math.max(...ys)
  if (y0 === y1) { y0 -= 1; y1 += 1 }
  const ty0 = tf(y0), ty1 = tf(y1)
  const W = width - M.l - M.r, H = height - M.t - M.b
  const sx = (x: number) => M.l + ((x - x0) / (x1 - x0 || 1)) * W
  const sy = (y: number) => M.t + H - ((tf(y) - ty0) / (ty1 - ty0 || 1)) * H
  const yt = logY ? Array.from({ length: Math.floor(ty1) - Math.ceil(ty0) + 1 }, (_, i) => Math.pow(10, Math.ceil(ty0) + i)) : ticks(y0, y1)
  const xt = ticks(x0, x1, 6)
  const path = (s: Series) => s.x.map((x, i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(s.y[i]).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {yt.map((v) => (
        <g key={v}>
          <line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke="rgba(120,160,220,0.1)" />
          <text x={M.l - 6} y={sy(v) + 3} textAnchor="end" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{fmt(v)}</text>
        </g>
      ))}
      {xt.map((v) => (
        <text key={v} x={sx(v)} y={height - M.b + 14} textAnchor="middle" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{fmt(v)}</text>
      ))}
      {band && (
        <path d={band.x.map((x, i) => `${i ? 'L' : 'M'}${sx(x)},${sy(band.hi[i])}`).join('') +
          band.x.slice().reverse().map((x, i) => `L${sx(x)},${sy(band.lo[band.x.length - 1 - i])}`).join('') + 'Z'}
          fill={band.color} opacity={0.14} />
      )}
      {hLines?.map((h) => (
        <g key={h.label}>
          <line x1={M.l} x2={width - M.r} y1={sy(h.y)} y2={sy(h.y)} stroke={h.color} strokeDasharray="5 4" strokeWidth={1.2} />
          <text x={width - M.r - 4} y={sy(h.y) - 4} textAnchor="end" fontSize="10.5" fill={h.color} fontFamily="JetBrains Mono">{h.label}</text>
        </g>
      ))}
      {vLine && <line x1={sx(vLine.x)} x2={sx(vLine.x)} y1={M.t} y2={M.t + H} stroke={vLine.color} strokeDasharray="3 3" />}
      {series.map((s) => (
        <path key={s.name} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.8} strokeDasharray={s.dashed ? '4 3' : undefined}
          style={{ filter: s.dashed ? undefined : `drop-shadow(0 0 3px ${s.color})` }} />
      ))}
      {markers?.map((m) => (
        <g key={m.label}>
          <circle cx={sx(m.x)} cy={sy(m.y)} r={4.5} fill="none" stroke={m.color} strokeWidth={1.6} />
          <text x={sx(m.x) + 7} y={sy(m.y) + 12} fontSize="10.5" fill={m.color} fontFamily="JetBrains Mono">{m.label}</text>
        </g>
      ))}
      <line x1={M.l} x2={M.l} y1={M.t} y2={M.t + H} stroke="rgba(120,160,220,0.3)" />
      <line x1={M.l} x2={width - M.r} y1={M.t + H} y2={M.t + H} stroke="rgba(120,160,220,0.3)" />
      {xLabel && <text x={M.l + W / 2} y={height - 3} textAnchor="middle" fontSize="11" fill="#8b97ad">{xLabel}</text>}
      {yLabel && <text x={11} y={M.t + H / 2} textAnchor="middle" fontSize="11" fill="#8b97ad" transform={`rotate(-90 11 ${M.t + H / 2})`}>{yLabel}</text>}
      {legend && series.length > 1 && (
        <g>
          {series.map((s, i) => (
            <g key={s.name} transform={`translate(${legendPos.endsWith('r') ? width - M.r - 190 : M.l + 8},${legendPos.startsWith('b') ? M.t + H - 8 - (series.length - 1 - i) * 13 : M.t + 8 + i * 13})`}>
              <line x1={0} x2={14} y1={0} y2={0} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
              <text x={19} y={3} fontSize="10.5" fill="#c9d3e6">{s.name}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
}

export function BarChart({ labels, values, colors, width = 460, height = 200, yMax, refLine, band, valueFmt }: {
  labels: string[]; values: number[]; colors?: string[]; width?: number; height?: number; yMax?: number
  refLine?: { y: number; label: string; color: string }; band?: { lo: number; hi: number; color: string }
  valueFmt?: (v: number) => string
}) {
  const W = width - M.l - M.r, H = height - M.t - M.b
  const top = yMax ?? Math.max(...values, refLine?.y ?? 0, band?.hi ?? 0) * 1.1
  const sy = (v: number) => M.t + H - (v / (top || 1)) * H
  const bw = W / values.length
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {ticks(0, top).map((v) => (
        <g key={v}>
          <line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke="rgba(120,160,220,0.1)" />
          <text x={M.l - 6} y={sy(v) + 3} textAnchor="end" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{fmt(v)}</text>
        </g>
      ))}
      {band && <rect x={M.l} width={W} y={sy(band.hi)} height={sy(band.lo) - sy(band.hi)} fill={band.color} opacity={0.15} />}
      {values.map((v, i) => (
        <g key={i}>
          <rect x={M.l + i * bw + bw * 0.15} width={bw * 0.7} y={sy(v)} height={Math.max(0, M.t + H - sy(v))}
            fill={colors?.[i] ?? '#22E4FF'} opacity={0.85} rx={2} />
          <text x={M.l + i * bw + bw / 2} y={sy(v) - 4} textAnchor="middle" fontSize="10.5" fill="#e6ecf7" fontFamily="JetBrains Mono">
            {valueFmt ? valueFmt(v) : fmt(v)}
          </text>
          <text x={M.l + i * bw + bw / 2} y={height - M.b + 14} textAnchor="middle" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{labels[i]}</text>
        </g>
      ))}
      {refLine && (
        <g>
          <line x1={M.l} x2={width - M.r} y1={sy(refLine.y)} y2={sy(refLine.y)} stroke={refLine.color} strokeDasharray="5 4" />
          <text x={width - M.r - 4} y={sy(refLine.y) - 4} textAnchor="end" fontSize="10.5" fill={refLine.color} fontFamily="JetBrains Mono">{refLine.label}</text>
        </g>
      )}
      <line x1={M.l} x2={width - M.r} y1={M.t + H} y2={M.t + H} stroke="rgba(120,160,220,0.3)" />
    </svg>
  )
}

/** Sequential colour from dark to cyan; or diverging around `pivot` (red below, cyan/green above). */
export function heatColor(v: number, min: number, max: number, pivot?: number): string {
  const t = Math.max(0, Math.min(1, (v - min) / (max - min || 1)))
  if (pivot !== undefined) {
    if (v < pivot) {
      const s = Math.max(0, Math.min(1, (v - min) / (pivot - min || 1)))
      return `rgb(${Math.round(90 + 165 * (1 - s) * 0.9)},${Math.round(30 + 40 * s)},${Math.round(50 + 50 * s)})`
    }
    const s = Math.max(0, Math.min(1, (v - pivot) / (max - pivot || 1)))
    return `rgb(${Math.round(20 + 14 * s)},${Math.round(80 + 148 * s)},${Math.round(110 + 145 * s)})`
  }
  return `rgb(${Math.round(10 + 24 * t)},${Math.round(16 + 212 * t)},${Math.round(30 + 225 * t)})`
}

export function Heatmap({ grid, xs, ys, xLabel, yLabel, min, max, pivot, width = 420, height = 300, cellText, contour, rowLabels, colLabels }: {
  grid: number[][]; xs?: number[]; ys?: number[]; xLabel?: string; yLabel?: string; min?: number; max?: number; pivot?: number
  width?: number; height?: number; cellText?: boolean; contour?: number; rowLabels?: string[]; colLabels?: string[]
}) {
  const flat = grid.flat()
  const lo = min ?? Math.min(...flat), hi = max ?? Math.max(...flat)
  const rows = grid.length, cols = grid[0]?.length ?? 0
  const W = width - M.l - M.r, H = height - M.t - M.b
  const cw = W / cols, ch = H / rows
  const edges = useMemo(() => {
    if (contour === undefined) return []
    const e: string[] = []
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const above = grid[r][c] >= contour
      if (c + 1 < cols && above !== grid[r][c + 1] >= contour) e.push(`M${M.l + (c + 1) * cw},${M.t + H - (r + 1) * ch}v${ch}`)
      if (r + 1 < rows && above !== grid[r + 1][c] >= contour) e.push(`M${M.l + c * cw},${M.t + H - (r + 1) * ch}h${cw}`)
    }
    return e
  }, [grid, contour, rows, cols, cw, ch, H])
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {grid.map((row, r) => row.map((v, c) => (
        <g key={`${r}-${c}`}>
          <rect x={M.l + c * cw} y={M.t + H - (r + 1) * ch} width={cw + 0.5} height={ch + 0.5} fill={heatColor(v, lo, hi, pivot)} />
          {cellText && <text x={M.l + c * cw + cw / 2} y={M.t + H - (r + 0.5) * ch + 3} textAnchor="middle" fontSize={Math.min(10, cw / 3.6)}
            fill="#05060a" fontFamily="JetBrains Mono" fontWeight={600}>{v.toFixed(2)}</text>}
        </g>
      )))}
      {edges.length > 0 && <path d={edges.join('')} stroke="#ffffff" strokeWidth={2} fill="none" />}
      {(colLabels ?? xs?.map((x) => fmt(x)))?.map((l, c) => (cols <= 14 || c % 2 === 0) && (
        <text key={c} x={M.l + c * cw + cw / 2} y={height - M.b + 13} textAnchor="middle" fontSize="9" fill="#8b97ad" fontFamily="JetBrains Mono">{l}</text>
      ))}
      {(rowLabels ?? ys?.map((y) => fmt(y)))?.map((l, r) => (rows <= 14 || r % 2 === 0) && (
        <text key={r} x={M.l - 5} y={M.t + H - (r + 0.5) * ch + 3} textAnchor="end" fontSize="9" fill="#8b97ad" fontFamily="JetBrains Mono">{l}</text>
      ))}
      {xLabel && <text x={M.l + W / 2} y={height - 3} textAnchor="middle" fontSize="11" fill="#8b97ad">{xLabel}</text>}
      {yLabel && <text x={11} y={M.t + H / 2} textAnchor="middle" fontSize="11" fill="#8b97ad" transform={`rotate(-90 11 ${M.t + H / 2})`}>{yLabel}</text>}
    </svg>
  )
}

/** Values in [0,1] -> labelled histogram (e.g. fidelities). */
export function Histogram({ values, bins = 20, min = 0, max = 1, color = '#22E4FF', width = 460, height = 180, refLine, xLabel }: {
  values: number[]; bins?: number; min?: number; max?: number; color?: string; width?: number; height?: number
  refLine?: { x: number; label: string; color: string }; xLabel?: string
}) {
  const counts = new Array(bins).fill(0)
  values.forEach((v) => { counts[Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * bins)))]++ })
  const W = width - M.l - M.r, H = height - M.t - M.b
  const top = Math.max(...counts, 1)
  const bw = W / bins
  const sx = (x: number) => M.l + ((x - min) / (max - min)) * W
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {counts.map((c, i) => (
        <rect key={i} x={M.l + i * bw + 1} width={bw - 2} y={M.t + H - (c / top) * H} height={(c / top) * H} fill={color} opacity={0.8} />
      ))}
      {ticks(min, max, 5).map((v) => (
        <text key={v} x={sx(v)} y={height - M.b + 14} textAnchor="middle" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{fmt(v)}</text>
      ))}
      <text x={M.l - 6} y={M.t + 8} textAnchor="end" fontSize="10.5" fill="#8b97ad" fontFamily="JetBrains Mono">{top}</text>
      {refLine && (
        <g>
          <line x1={sx(refLine.x)} x2={sx(refLine.x)} y1={M.t} y2={M.t + H} stroke={refLine.color} strokeDasharray="5 4" />
          <text x={sx(refLine.x) + 4} y={M.t + 10} fontSize="10.5" fill={refLine.color} fontFamily="JetBrains Mono">{refLine.label}</text>
        </g>
      )}
      <line x1={M.l} x2={width - M.r} y1={M.t + H} y2={M.t + H} stroke="rgba(120,160,220,0.3)" />
      {xLabel && <text x={M.l + W / 2} y={height - 3} textAnchor="middle" fontSize="11" fill="#8b97ad">{xLabel}</text>}
    </svg>
  )
}
