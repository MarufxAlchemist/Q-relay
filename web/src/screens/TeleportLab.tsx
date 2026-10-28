import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { api, type TeleportResult, type Vec3 } from '../lib/api'
import { BlochSphere } from '../scenes/BlochSphere'
import { Effects } from '../scenes/MissionScene'
import { anglesToBloch, blochToAngles, fromThree } from '../lib/three'
import { FidelityGauge, NoiseSlider, Seg, SourceBadge } from '../components/controls'
import { CircuitView, GATE_TO_OPS, TELEPORT_CIRCUIT } from '../components/CircuitView'
import { Heatmap, Histogram, LineChart } from '../components/charts'
import { Fill, Panel } from '../components/Fill'
import { CLASSICAL_BOUND, useStore } from '../store/useStore'
import { LabShell } from '../components/Story'
import { TeleportStory } from './TeleportStory'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CARD: [string, number, number][] = [
  ['|0⟩', 0, 0], ['|1⟩', Math.PI, 0], ['|+⟩', Math.PI / 2, 0], ['|−⟩', Math.PI / 2, Math.PI],
  ['|+i⟩', Math.PI / 2, Math.PI / 2], ['|−i⟩', Math.PI / 2, 3 * Math.PI / 2],
]
const SERIES_COLORS = ['#4DFFA6', '#F5C84B', '#FF8A5B']

function TeleportOverview() {
  const noise = useStore((s) => s.noise)
  const low = useStore((s) => s.lowPower)
  const [theta, setTheta] = useState(1.1)
  const [phi, setPhi] = useState(0.8)
  const [variant, setVariant] = useState<'dynamic' | 'deferred'>('dynamic')
  const [res, setRes] = useState<TeleportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [sweep, setSweep] = useState<any>(null)
  const timer = useRef<number | undefined>(undefined)
  const reqId = useRef(0)

  // Only the newest request may update the view (drags and slider moves fire many requests).
  const run = useCallback(async (body: Record<string, unknown>) => {
    const id = ++reqId.current
    setBusy(true); setErr(null)
    try {
      const r = await api.post<TeleportResult>('/api/teleport/run', { variant, noise: { level: noise }, shots: 2048, ...body })
      if (id !== reqId.current) return
      setRes(r); setStep(r.steps.length - 1)
      if (body.random) { setTheta(r.theta); setPhi(r.phi) }
    } catch (e) {
      if (id === reqId.current) setErr((e as Error).message)
    } finally {
      if (id === reqId.current) setBusy(false)
    }
  }, [variant, noise])

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => run({ theta, phi }), 180)
    return () => window.clearTimeout(timer.current)
  }, [theta, phi, run])
  useEffect(() => { api.get('/api/teleport/sweep').then(setSweep).catch(() => null) }, [])

  const s = res?.steps[step]
  const input: Vec3 = anglesToBloch(theta, phi)
  const sw1 = sweep?.teleport_sweep_1d
  const sw2 = sweep?.teleport_sweep_2d
  const states = sweep?.teleport_states
  const t1 = sweep?.teleport_t1_sweep

  return (
    <div style={{ height: '100%' }}>
      <div className="fit" style={{ gridTemplateColumns: '1.5fr 1fr', gridTemplateRows: '1.3fr 1fr' }}>
        {/* 3-D stepper */}
        <section className="panel flex" style={{ padding: 0 }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Canvas dpr={low ? 1 : [1, 2]} camera={{ position: [0, 0.3, 8.6], fov: 36 }}>
              <color attach="background" args={['#030806']} />
              <ambientLight intensity={0.5} />
              <BlochSphere vector={step <= 1 ? input : s?.bloch[0] ?? input} position={[-3.1, 0.15, 0]} scale={1.2} label="q0 · drag to set |ψ⟩"
                onDrag={(p) => { const { theta: t, phi: f } = blochToAngles(fromThree(p)); setTheta(t); setPhi(f) }} />
              <BlochSphere vector={s?.bloch[1] ?? [0, 0, 1]} position={[0, 0.15, 0]} scale={0.8} color="#8F7CFF" label="q1" dim trail={false} showLabels={false} />
              <BlochSphere vector={s?.bloch[2] ?? [0, 0, 1]} position={[3.1, 0.15, 0]} scale={1.2} color="#F5C84B" ghost={input} label="q2 · Bob" />
              <Effects />
            </Canvas>
            <div style={{ position: 'absolute', top: 8, left: 10, right: 150 }} className="row">
              <button className="btn magenta" onClick={() => run({ random: true })}>Random state from QRNG</button>
              {CARD.map(([c, t, f]) => (
                <button key={c} className="btn" style={{ padding: '4px 8px' }} onClick={() => { setTheta(t); setPhi(f) }}>{c}</button>
              ))}
            </div>
            <div style={{ position: 'absolute', top: 6, right: 10 }}><FidelityGauge value={res?.exact.fidelity ?? null} size={118} /></div>
            {s && <div className="caption-bar" style={{ fontSize: 13, bottom: 6, padding: '6px 12px' }}>{s.caption}</div>}
          </div>
          <div style={{ padding: '4px 10px 6px', display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
            <div className="row">
              <span className="lbl">step</span>
              <input type="range" min={0} max={(res?.steps.length ?? 1) - 1} value={step} onChange={(e) => setStep(+e.target.value)} style={{ flex: 1 }} />
              <span className="mono" style={{ width: 92, fontSize: 12 }}>{s?.name ?? '—'}</span>
            </div>
            <CircuitView circuit={TELEPORT_CIRCUIT} highlight={s ? GATE_TO_OPS[s.gate] ?? [] : []} qubitLabels={['q0 ψ', 'q1 A', 'q2 B']} height={104} />
          </div>
        </section>

        {/* run + Haar */}
        <div className="stack">
          <Panel title="Run" right={<>{busy && <span className="mono amber" style={{ fontSize: 10 }}>computing…</span>}<SourceBadge source="SIM" /></>}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <Seg value={variant} options={['dynamic', 'deferred'] as const} onChange={setVariant} />
              <NoiseSlider compact />
            </div>
            {err && <div className="red mono" style={{ fontSize: 11 }}>request failed: {err}. Is the server running?</div>}
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <dl className="kv">
                <dt>θ, φ</dt><dd>{theta.toFixed(2)}, {phi.toFixed(2)}</dd>
                <dt>exact F</dt><dd>{res ? res.exact.fidelity.toFixed(6) : '—'}</dd>
                <dt>tomography F</dt><dd>{res ? res.tomography.fidelity.toFixed(4) : '—'}</dd>
                {res?.tomography.fidelity_mitigated !== undefined && <><dt>mitigated F</dt><dd className="green">{res.tomography.fidelity_mitigated.toFixed(4)}</dd></>}
              </dl>
              <table className="t">
                <thead><tr><th>branch</th><th>P</th><th>F</th></tr></thead>
                <tbody>
                  {res && Object.entries(res.exact.branches).sort().map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{v.probability.toFixed(2)}</td><td className={v.fidelity > CLASSICAL_BOUND ? 'green' : 'red'}>{v.fidelity.toFixed(5)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title={`Fidelity over ${states?.ideal_exact.n ?? 200} random states`} style={{ flex: 1 }}>
            {states && (
              <>
                <Fill>{(w, h) => <Histogram width={w} height={h} values={states.noisy_exact.fidelities} min={0.5} max={1} color="#F5C84B"
                  refLine={{ x: CLASSICAL_BOUND, label: '2/3', color: '#FF8A5B' }} xLabel="fidelity (noisy: p2=0.1, p1=0.01, readout 0.02)" />}</Fill>
                <dl className="kv" style={{ gridTemplateColumns: 'auto 1fr auto 1fr' }}>
                  <dt>ideal exact</dt><dd>{states.ideal_exact.mean.toFixed(6)}</dd>
                  <dt>ideal tomography</dt><dd>{states.ideal_tomography.mean.toFixed(3)}±{states.ideal_tomography.std.toFixed(3)}</dd>
                  <dt>noisy exact</dt><dd>{states.noisy_exact.mean.toFixed(3)}±{states.noisy_exact.std.toFixed(3)}</dd>
                  <dt>readout fix</dt><dd>{states.mitigation.raw.toFixed(3)}→<span className="green">{states.mitigation.mitigated.toFixed(3)}</span></dd>
                </dl>
              </>
            )}
          </Panel>
        </div>

        {/* analyses */}
        <div className="grid" style={{ gridColumn: 'span 2', gridTemplateColumns: '1.35fr 1fr 0.8fr 0.8fr', gap: 8, minHeight: 0 }}>
          <Panel title="Average fidelity vs noise" right={<SourceBadge source="SIM" />}>
            {sw1 && <Fill>{(w, h) => (
              <LineChart width={w} height={h} yMin={0.5} yMax={1} legendPos="tr" xLabel="2-qubit depolarizing p₂"
                series={[
                  ...Object.entries(sw1.curves).map(([k, v], i) => ({ name: k, x: sw1.p2, y: v as number[], color: SERIES_COLORS[i] })),
                  { name: 'analytic (CX-only)', x: sw1.p2, y: sw1.analytic_cx_only, color: '#ffffff', dashed: true, width: 1 },
                ]}
                hLines={[{ y: CLASSICAL_BOUND, label: 'classical limit 2/3', color: '#FF8A5B' }]}
                markers={Object.entries(sw1.crossings).filter(([, x]) => x !== null).map(([, x], i) => ({ x: x as number, y: CLASSICAL_BOUND, label: `${(x as number).toFixed(2)}`, color: SERIES_COLORS[i] }))} />
            )}</Fill>}
          </Panel>
          <Panel title="2-D sweep (white line: F = 2/3)">
            {sw2 && <Fill>{(w, h) => <Heatmap width={w} height={h} grid={sw2.fidelity} xs={sw2.p2} ys={sw2.p1} xLabel="p₂ (2-qubit)" yLabel="p₁" min={0.5} max={1} pivot={CLASSICAL_BOUND} contour={CLASSICAL_BOUND} />}</Fill>}
          </Panel>
          <Panel title="Process matrix (noisy)" right={states && <span className="mono dim" style={{ fontSize: 10 }}>F_avg {states.cardinal_noisy_exact.average_fidelity.toFixed(3)}</span>}>
            {states && <Fill>{(w, h) => <Heatmap width={w} height={h} grid={(states.cardinal_noisy_exact.ptm as number[][]).slice().reverse()} min={-1} max={1} cellText colLabels={['I', 'X', 'Y', 'Z']} rowLabels={['Z', 'Y', 'X', 'I']} />}</Fill>}
          </Panel>
          <Panel title="Thermal relaxation">
            {t1 && <Fill>{(w, h) => <LineChart width={w} height={h} series={[{ name: 'F', x: t1.t1_us.map((v: number) => Math.log10(v)), y: t1.fidelity, color: '#8F7CFF' }]}
              hLines={[{ y: CLASSICAL_BOUND, label: '2/3', color: '#FF8A5B' }]} xLabel="log₁₀ T1=T2 (µs)" yMin={0.5} yMax={1} />}</Fill>}
          </Panel>
        </div>
      </div>
    </div>
  )
}

export function TeleportLab() {
  return <LabShell title="TELEPORT LAB" subtitle="Problem 1 · moving a qubit from Alice to Bob" story={() => <TeleportStory />} overview={() => <TeleportOverview />} />
}
