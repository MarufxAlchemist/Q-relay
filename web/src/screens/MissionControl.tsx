import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MissionScene } from '../scenes/MissionScene'
import { CircuitView, GATE_TO_OPS, TELEPORT_CIRCUIT } from '../components/CircuitView'
import { BitLamp, FidelityGauge, NoiseSlider, Seg, SourceBadge } from '../components/controls'
import { AmplitudeBars } from '../components/bits'
import { Fill } from '../components/Fill'
import { useLiveRerun, useMission } from '../hooks/useMission'
import { CLASSICAL_BOUND, useStore } from '../store/useStore'
import { angleBetween } from '../lib/three'

const STAGES = [
  { key: 'qrng', label: 'QRNG', sub: 'entropy pool' },
  { key: 'teleport', label: 'TELEPORT', sub: 'Alice ⇒ Bob' },
  { key: 'dj', label: 'DISTRIBUTED DJ', sub: 'one query' },
] as const

export function MissionControl() {
  const events = useStore((s) => s.events)
  const fidelity = useStore((s) => s.fidelity)
  const bloch = useStore((s) => s.bloch)
  const ghost = useStore((s) => s.ghost)
  const presenter = useStore((s) => s.presenter)
  const demoCaption = useStore((s) => s.caption)
  const tickStart = useStore((s) => s.tick['mission.start'] ?? 0)
  const { start, running } = useMission()
  useLiveRerun()
  const [n, setN] = useState<number | 'auto'>('auto')
  const [speed, setSpeed] = useState(1)

  useEffect(() => { if (tickStart) start({ n: 3, speed: 1.4 }) }, [tickStart, start])

  const last = events[events.length - 1]
  const byType = useMemo(() => {
    const m: Record<string, typeof events[number]> = {}
    events.forEach((e) => { m[e.type] = e })
    return m
  }, [events])

  const stage = last?.stage ?? null
  const gate = last?.data?.gate as string | undefined
  const highlight = gate ? GATE_TO_OPS[gate] ?? [] : []
  const outcome = byType['alice_bsm']?.data?.outcome ?? byType['classical_bits_sent']?.data?.outcome
  const m0 = events.some((e) => e.data?.step === 'measure') ? outcome?.m0 ?? null : null
  const m1 = events.some((e) => e.data?.step === 'measure') ? outcome?.m1 ?? null : null

  const classicalEv = byType['classical_bits_sent']
  const classicalAt = useRef<number | null>(null)
  const [classicalStamp, setClassicalStamp] = useState<number | null>(null)
  useEffect(() => {
    if (classicalEv) { classicalAt.current = performance.now(); setClassicalStamp(classicalAt.current) }
    else setClassicalStamp(null)
  }, [classicalEv])

  const beamActive = useMemo(() => {
    if (!events.length) return 0.3
    const types = new Set(events.map((e) => e.type))
    if (types.has('bob_correction') || types.has('tomography')) return 0.15
    if (types.has('bell_pair')) return 1
    return 0.3
  }, [events])

  const err = ghost ? angleBetween(ghost, bloch[2]) : NaN
  const bobLen = Math.hypot(...bloch[2])
  const drawn = byType['state_drawn']?.data
  const verdict = byType['verdict']?.data
  const djAmp = (byType['dj_interference'] ?? byType['dj_oracle_query'] ?? byType['dj_hadamard'])?.data?.amplitudes
  const qrng = byType['qrng_batch']?.data
  const health = byType['health_test']?.data
  const caption = demoCaption ?? last?.caption ?? 'Press LAUNCH MISSION. The QRNG seeds a secret state and a hidden oracle; Alice teleports the state to Bob; Bob solves Deutsch–Jozsa with one query.'
  const quantum = fidelity !== null && fidelity > CLASSICAL_BOUND

  return (
    <div className="screen no-pad" style={{ display: 'grid', gridTemplateRows: 'auto 1fr 196px', height: '100%' }}>
      {/* top rail */}
      <div className="row" style={{ padding: '6px 12px', gap: 14, borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ gap: 6 }}>
          {STAGES.map((s, i) => {
            const idx = STAGES.findIndex((x) => x.key === stage)
            const state = stage === 'summary' || idx > i ? 'done' : idx === i ? 'active' : 'todo'
            const col = state === 'active' ? 'var(--cyan)' : state === 'done' ? 'var(--green)' : 'var(--dim)'
            return (
              <div key={s.key} className="row" style={{ gap: 6 }}>
                <div style={{ border: `1px solid ${col}`, color: col, padding: '5px 10px', borderRadius: 4, minWidth: 128,
                  boxShadow: state === 'active' ? '0 0 14px rgba(77, 255, 166,0.35)' : 'none' }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', fontWeight: 600 }}>{i + 1}. {s.label}</div>
                  <div className="mono" style={{ fontSize: 9, opacity: 0.8 }}>{s.sub}</div>
                </div>
                {i < 2 && <span style={{ color: 'var(--dim)' }}>→</span>}
              </div>
            )
          })}
        </div>
        <div className="spacer" style={{ flex: 1 }} />
        <div className="row" style={{ gap: 8 }}>
          <span className="lbl">n</span>
          <Seg value={n} options={['auto', 2, 3, 4, 5] as const} onChange={setN} />
          <span className="lbl">speed</span>
          <Seg value={speed} options={[0.5, 1, 2, 4] as const} onChange={setSpeed} labels={{ 0.5: '½×', 1: '1×', 2: '2×', 4: '4×' }} />
        </div>
        <NoiseSlider compact />
        <button className="btn magenta big" disabled={running} onClick={() => start({ n: n === 'auto' ? null : n, speed })}>
          {running ? 'MISSION RUNNING…' : events.length ? 'RELAUNCH' : 'LAUNCH MISSION'}
        </button>
      </div>

      {/* 3D stage */}
      <div style={{ position: 'relative', minHeight: 0 }}>
        <MissionScene beamActive={beamActive} classicalBits={m0 !== null ? [m0, m1] : null} classicalAt={classicalStamp} />

        <div className="panel" style={{ position: 'absolute', left: 16, top: 14, width: 250 }}>
          <h3>Alice <span className="grow" /><SourceBadge source="SIM" /></h3>
          <dl className="kv">
            <dt>θ</dt><dd>{drawn ? drawn.theta.toFixed(3) : '—'}</dd>
            <dt>φ</dt><dd>{drawn ? drawn.phi.toFixed(3) : '—'}</dd>
            <dt>|r| q0</dt><dd>{Math.hypot(...bloch[0]).toFixed(3)}</dd>
            <dt>|r| q1</dt><dd>{Math.hypot(...bloch[1]).toFixed(3)}</dd>
          </dl>
          <div className="row" style={{ marginTop: 10, justifyContent: 'center', gap: 18 }}>
            <BitLamp bit={m0} label="m0 → Z" />
            <BitLamp bit={m1} label="m1 → X" />
          </div>
          <div className="tip" style={{ marginTop: 8 }}>Short arrow = mixed qubit. Entangled halves look maximally mixed on their own.</div>
        </div>

        <div className="panel" style={{ position: 'absolute', right: 16, top: 14, width: 270 }}>
          <h3>Bob <span className="grow" />{fidelity !== null && <span className={quantum ? 'green' : 'red'} style={{ fontSize: 10 }}>{quantum ? '> 2/3' : '< 2/3'}</span>}</h3>
          <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
            <FidelityGauge value={fidelity} size={128} />
            <dl className="kv" style={{ flex: 1, alignSelf: 'center' }}>
              <dt>|r|</dt><dd>{bobLen.toFixed(3)}</dd>
              <dt>error</dt><dd>{isFinite(err) ? `${(err * 180 / Math.PI).toFixed(1)}°` : '—'}</dd>
              <dt>tomo F</dt><dd>{byType['tomography'] ? byType['tomography'].data.fidelity.toFixed(3) : '—'}</dd>
            </dl>
          </div>
          <div className="tip">White ghost = Alice's original |ψ⟩. Classical limit 2/3: no measure-and-resend scheme beats it on average.</div>
        </div>

        <AnimatePresence>
          {fidelity !== null && !quantum && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', color: 'var(--red)',
                border: '1px solid var(--red)', padding: '6px 16px', borderRadius: 4, letterSpacing: '0.2em', fontWeight: 700,
                background: 'rgba(255, 84, 112,0.1)', boxShadow: '0 0 24px rgba(255, 84, 112,0.4)' }}>
              CLASSICAL REGIME · F &lt; 2/3
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={caption} className="caption-bar" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={presenter ? { fontSize: 26 } : undefined}>
            {caption}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* bottom strip */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.5fr 1.2fr', padding: '0 10px 8px', gap: 8, minHeight: 0 }}>
        <div className="panel flex">
          <h3>1 · Entropy pool <span className="grow" /><SourceBadge source="SIM" /></h3>
          {qrng ? (
            <>
              <div className="mono" style={{ fontSize: 10.5, lineHeight: 1.35, wordBreak: 'break-all', maxHeight: 74, overflow: 'hidden' }}>
                {(qrng.preview as number[]).slice(0, 240).map((b, i) => <span key={i} style={{ color: b ? 'var(--magenta)' : 'var(--cyan)' }}>{b}</span>)}
              </div>
              <dl className="kv" style={{ marginTop: 8 }}>
                <dt>bits</dt><dd>{qrng.n_bits.toLocaleString()}</dd>
                <dt>P(1)</dt><dd>{qrng.p1.toFixed(4)}</dd>
                <dt>health</dt><dd className={health?.passed ? 'green' : health ? 'red' : ''}>{health ? (health.passed ? 'PASS' : 'FLAG') : '…'}</dd>
              </dl>
            </>
          ) : <div className="tip">Waiting for launch. Note: simulator bits are pseudo-random under the hood; only hardware bits are physically random.</div>}
        </div>
        <div className="panel flex">
          <h3>2 · Teleportation circuit (dynamic: mid-circuit measurement + feed-forward)</h3>
          <Fill minH={50}>{(_, h) => <CircuitView circuit={TELEPORT_CIRCUIT} highlight={highlight} qubitLabels={['q0 ψ', 'q1 A', 'q2 B']} height={h} />}</Fill>
        </div>
        <div className="panel flex">
          <h3>3 · Distributed Deutsch–Jozsa <span className="grow" />{byType['oracle_chosen'] && <span className="mono dim">n={byType['oracle_chosen'].data.n}</span>}</h3>
          {djAmp ? (
            <>
              <div className="mono dim" style={{ fontSize: 10 }}>{djAmp.stage.toUpperCase()}</div>
              <Fill minH={50}>{(w, h) => <AmplitudeBars re={djAmp.re} n={byType['oracle_chosen']?.data.n ?? 3} width={w} height={h} highlightZero />}</Fill>
            </>
          ) : <div className="tip">Bob's ancilla is a teleported |−⟩. If teleportation is noisy, the ancilla is imperfect and DJ degrades: one noise slider affects all three stages.</div>}
          {verdict && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row" style={{ marginTop: 6, justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, letterSpacing: '0.16em', color: verdict.verdict === 'constant' ? 'var(--cyan)' : 'var(--magenta)' }}>
                {verdict.verdict.toUpperCase()}
              </span>
              <span className={verdict.correct ? 'green mono' : 'red mono'}>{verdict.correct ? '✓ matches truth' : '✗ noise error'}</span>
              <span className="mono dim">1 query vs {verdict.classical_worst}</span>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
