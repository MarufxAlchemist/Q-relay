import type { CircuitJson, CircuitOp } from '../lib/api'

const GATE_COLOR: Record<string, string> = {
  h: '#22E4FF', x: '#FF3DA5', z: '#8B5CF6', u: '#2EE59D', sdg: '#8B5CF6', s: '#8B5CF6', measure: '#FFB020', ry: '#2EE59D',
}

function label(op: CircuitOp): string {
  if (op.name === 'u') return 'U(θ,φ)'
  if (op.name === 'sdg') return 'S†'
  if (op.name === 'mcx') return '⊕'
  return op.name.toUpperCase()
}

/** Layer ops greedily into columns (an op goes after the last op touching any qubit in its span). */
function layout(c: CircuitJson) {
  const last = new Array(c.num_qubits).fill(-1)
  return c.ops.filter((o) => o.name !== 'barrier').map((op, i) => {
    const lo = Math.min(...op.qubits), hi = Math.max(...op.qubits)
    let col = 0
    for (let q = lo; q <= hi; q++) col = Math.max(col, last[q] + 1)
    for (let q = lo; q <= hi; q++) last[q] = col
    return { op, col, i }
  })
}

export function CircuitView({ circuit, highlight = [], qubitLabels, height }: {
  circuit: CircuitJson; highlight?: number[]; qubitLabels?: string[]; height?: number
}) {
  const items = layout(circuit)
  const cols = Math.max(...items.map((i) => i.col), 0) + 1
  const dx = 46, dy = 34, x0 = 70, y0 = 20
  const W = x0 + cols * dx + 20, H = y0 + circuit.num_qubits * dy
  const qy = (q: number) => y0 + q * dy
  const cx = (c: number) => x0 + c * dx + dx / 2
  return (
    <svg width="100%" height={height ?? '100%'} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {Array.from({ length: circuit.num_qubits }, (_, q) => (
        <g key={q}>
          <text x={6} y={qy(q) + 4} fontSize="11" fill="#8b97ad" fontFamily="JetBrains Mono">{qubitLabels?.[q] ?? `q${q}`}</text>
          <line x1={x0 - 10} x2={W - 10} y1={qy(q)} y2={qy(q)} stroke="rgba(120,160,220,0.35)" />
        </g>
      ))}
      {items.map(({ op, col, i }) => {
        const hot = highlight.includes(i)
        const x = cx(col)
        const color = GATE_COLOR[op.name] ?? '#c9d3e6'
        const glow = hot ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined
        const op_opacity = highlight.length && !hot ? 0.45 : 1
        if (op.name === 'cx' || op.name === 'cz' || op.name === 'mcx') {
          const [t] = op.qubits.slice(-1)
          const ctrls = op.qubits.slice(0, -1)
          const ys = op.qubits.map(qy)
          return (
            <g key={i} style={glow} opacity={op_opacity}>
              <line x1={x} x2={x} y1={Math.min(...ys)} y2={Math.max(...ys)} stroke={hot ? '#22E4FF' : '#c9d3e6'} strokeWidth={1.5} />
              {ctrls.map((q) => <circle key={q} cx={x} cy={qy(q)} r={4.5} fill={hot ? '#22E4FF' : '#c9d3e6'} />)}
              {op.name === 'cz' ? <circle cx={x} cy={qy(t)} r={4.5} fill={hot ? '#22E4FF' : '#c9d3e6'} /> : (
                <g>
                  <circle cx={x} cy={qy(t)} r={10} fill="#05060a" stroke={hot ? '#22E4FF' : '#c9d3e6'} strokeWidth={1.5} />
                  <line x1={x - 10} x2={x + 10} y1={qy(t)} y2={qy(t)} stroke={hot ? '#22E4FF' : '#c9d3e6'} strokeWidth={1.5} />
                  <line x1={x} x2={x} y1={qy(t) - 10} y2={qy(t) + 10} stroke={hot ? '#22E4FF' : '#c9d3e6'} strokeWidth={1.5} />
                </g>
              )}
            </g>
          )
        }
        const y = qy(op.qubits[0])
        if (op.name === 'measure') {
          return (
            <g key={i} style={glow} opacity={op_opacity}>
              <rect x={x - 14} y={y - 13} width={28} height={26} rx={3} fill="#05060a" stroke={color} strokeWidth={hot ? 2 : 1.2} />
              <path d={`M${x - 9},${y + 6} A9,9 0 0 1 ${x + 9},${y + 6}`} fill="none" stroke={color} strokeWidth={1.2} />
              <line x1={x} x2={x + 7} y1={y + 6} y2={y - 6} stroke={color} strokeWidth={1.2} />
            </g>
          )
        }
        return (
          <g key={i} style={glow} opacity={op_opacity}>
            {op.condition && (
              <>
                <line x1={x - 1.5} x2={x - 1.5} y1={y + 13} y2={H - 2} stroke="#FFB020" strokeWidth={1} opacity={0.6} />
                <line x1={x + 1.5} x2={x + 1.5} y1={y + 13} y2={H - 2} stroke="#FFB020" strokeWidth={1} opacity={0.6} />
                <text x={x} y={y - 16} textAnchor="middle" fontSize="8.5" fill="#FFB020" fontFamily="JetBrains Mono">
                  {op.condition.register}=={op.condition.value}
                </text>
              </>
            )}
            <rect x={x - 17} y={y - 13} width={34} height={26} rx={3} fill="#05060a" stroke={color} strokeWidth={hot ? 2.2 : 1.2} />
            <text x={x} y={y + 4} textAnchor="middle" fontSize={label(op).length > 3 ? 8.5 : 12} fill={color} fontFamily="JetBrains Mono" fontWeight={600}>
              {label(op)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** The teleportation circuit as Mission Control draws it (matches qrelay.teleport.teleport_circuit, dynamic). */
export const TELEPORT_CIRCUIT: CircuitJson = {
  num_qubits: 3,
  ops: [
    { name: 'u', qubits: [0], params: [], condition: null },
    { name: 'h', qubits: [1], params: [], condition: null },
    { name: 'cx', qubits: [1, 2], params: [], condition: null },
    { name: 'cx', qubits: [0, 1], params: [], condition: null },
    { name: 'h', qubits: [0], params: [], condition: null },
    { name: 'measure', qubits: [0], params: [], condition: null },
    { name: 'measure', qubits: [1], params: [], condition: null },
    { name: 'x', qubits: [2], params: [], condition: { register: 'm1', value: 1 } },
    { name: 'z', qubits: [2], params: [], condition: { register: 'm0', value: 1 } },
  ],
}

/** Maps a TeleportStepper gate id to op indices in TELEPORT_CIRCUIT. */
export const GATE_TO_OPS: Record<string, number[]> = {
  u: [0], h_q1: [1], cx_q1q2: [2], cx_q0q1: [3], h_q0: [4], measure: [5, 6], classical: [5, 6], x_q2: [7], z_q2: [8],
}
