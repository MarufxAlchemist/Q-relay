import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { api, type TeleportResult, type Vec3 } from '../lib/api'
import { BlochSphere } from '../scenes/BlochSphere'
import { Effects } from '../scenes/MissionScene'
import { anglesToBloch, blochToAngles, fromThree } from '../lib/three'
import { FidelityGauge, NoiseSlider, Seg, SourceBadge } from '../components/controls'
import { CircuitView, GATE_TO_OPS, TELEPORT_CIRCUIT } from '../components/CircuitView'
import { Heatmap, Histogram, LineChart } from '../components/charts'
import { CLASSICAL_BOUND, useStore } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CARD = ['|0>', '|1>', '|+>', '|->', '|+i>', '|-i>']
const SERIES_COLORS = ['#22E4FF', '#FF3DA5', '#FFB020']

export function TeleportLab() {
  const noise = useStore((s) => s.noise)
  const low = useStore((s) => s.lowPower)
  const [theta, setTheta] = useState(1.1)
  const [phi, setPhi] = useState(0.8)
  const [variant, setVariant] = useState<'dynamic' | 'deferred'>('dynamic')
  const [res, setRes] = useState<TeleportResult | null>(null)
  const [step, setStep] = useState(0)
  const [sweep, setSweep] = useState<any>(null)
  const timer = useRef<number | undefined>(undefined)

  const run = useCallback(async (body: Record<string, unknown>) => {
    const r = await api.post<TeleportResult>('/api/teleport/run', { variant, noise: { level: noise }, shots: 2048, ...body })
    setRes(r); setTheta(r.theta); setPhi(r.phi); setStep(r.steps.length - 1)
  }, [variant, noise])

  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => run({ theta, phi }).catch(() => null), 180)
    return () => window.clearTimeout(timer.current)
  }, [theta, phi, noise, variant]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get('/api/teleport/sweep').then(setSweep).catch(() => null) }, [])

  const s = res?.steps[step]
  const input: Vec3 = anglesToBloch(theta, phi)
  const sw1 = sweep?.teleport_sweep_1d
  const sw2 = sweep?.teleport_sweep_2d
  const states = sweep?.teleport_states
  const t1 = sweep?.teleport_t1_sweep

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1.35fr 1fr', gap: 12 }}>
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ height: 380, position: 'relative' }}>
            <Canvas dpr={low ? 1 : [1, 2]} camera={{ position: [0, 0.5, 8.4], fov: 38 }}>
              <color attach="background" args={['#05060a']} />
              <ambientLight intensity={0.5} />
              <BlochSphere vector={step <= 1 ? input : s?.bloch[0] ?? input} position={[-3.1, 0.2, 0]} scale={1.2} label="q0 · drag to set |ψ⟩"
                onDrag={(p) => { const { theta: t, phi: f } = blochToAngles(fromThree(p)); setTheta(t); setPhi(f) }} />
              <BlochSphere vector={s?.bloch[1] ?? [0, 0, 1]} position={[0, 0.2, 0]} scale={0.8} color="#8B5CF6" label="q1" dim trail={false} showLabels={false} />
              <BlochSphere vector={s?.bloch[2] ?? [0, 0, 1]} position={[3.1, 0.2, 0]} scale={1.2} color="#FF3DA5" ghost={input} label="q2 · Bob" />
              <Effects />
            </Canvas>
            <div style={{ position: 'absolute', top: 12, left: 14 }} className="row">
              <button className="btn magenta" onClick={() => run({ random: true })}>Random state from QRNG</button>
              {CARD.map((c, i) => {
                const a = [[0, 0], [Math.PI, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI], [Math.PI / 2, Math.PI / 2], [Math.PI / 2, 3 * Math.PI / 2]][i]
                return <button key={c} className="btn" style={{ padding: '5px 8px' }} onClick={() => { setTheta(a[0]); setPhi(a[1]) }}>{c.replace('>', '⟩')}</button>
              })}
            </div>
            <div style={{ position: 'absolute', top: 12, right: 14 }}><FidelityGauge value={res?.exact.fidelity ?? null} size={120} /></div>
            {s && <div className="caption-bar" style={{ fontSize: 14, bottom: 10 }}>{s.caption}</div>}
          </div>
          <div style={{ padding: '10px 14px' }}>
            <div className="row">
              <span className="lbl">step</span>
              <input type="range" min={0} max={(res?.steps.length ?? 1) - 1} value={step} onChange={(e) => setStep(+e.target.value)} style={{ flex: 1 }} />
              <span className="mono" style={{ width: 120 }}>{s?.name ?? '—'}</span>
            </div>
            <CircuitView circuit={TELEPORT_CIRCUIT} highlight={s ? GATE_TO_OPS[s.gate] ?? [] : []} qubitLabels={['q0 ψ', 'q1 A', 'q2 B']} height={130} />
          </div>
        </div>

        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          <div className="panel">
            <h3>Run <span className="grow" /><SourceBadge source="SIM" /></h3>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <Seg value={variant} options={['dynamic', 'deferred'] as const} onChange={setVariant} />
              <NoiseSlider compact />
            </div>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>θ, φ</dt><dd>{theta.toFixed(3)}, {phi.toFixed(3)}</dd>
              <dt>exact F (branch-avg)</dt><dd>{res ? res.exact.fidelity.toFixed(6) : '—'}</dd>
              <dt>tomography F ({res?.tomography.shots} shots × 3)</dt><dd>{res ? res.tomography.fidelity.toFixed(4) : '—'}</dd>
              {res?.tomography.fidelity_mitigated !== undefined && <><dt>readout-mitigated F</dt><dd className="green">{res.tomography.fidelity_mitigated.toFixed(4)}</dd></>}
              <dt>r_out (tomography)</dt><dd>{res ? res.tomography.r_out.map((v) => v.toFixed(3)).join(', ') : '—'}</dd>
            </dl>
            {res && (
              <table className="t" style={{ marginTop: 10 }}>
                <thead><tr><th>branch</th><th>P</th><th>F (exact ρ_B)</th></tr></thead>
                <tbody>
                  {Object.entries(res.exact.branches).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td>{v.probability.toFixed(3)}</td><td className={v.fidelity > CLASSICAL_BOUND ? 'green' : 'red'}>{v.fidelity.toFixed(9)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="tip" style={{ marginTop: 6 }}>
              Exact F = ⟨ψ|ρ_B|ψ⟩ from Bob's density matrix in each measurement branch. Tomography rebuilds r_out from X/Y/Z measurements. Then F = (1 + r_in·r_out)/2.
            </div>
          </div>
          <div className="panel">
            <h3>Fidelity over {states?.ideal_exact.n ?? 200} Haar-random states (angles from the QRNG pool)</h3>
            {states && (
              <>
                <Histogram values={states.noisy_exact.fidelities} min={0.5} max={1} color="#FF3DA5" refLine={{ x: CLASSICAL_BOUND, label: '2/3', color: '#FFB020' }} height={150} xLabel="fidelity (noisy: p2=0.1, p1=0.01, readout 0.02)" />
                <dl className="kv">
                  <dt>ideal exact: mean / min</dt><dd>{states.ideal_exact.mean.toFixed(9)} / {states.ideal_exact.min.toFixed(9)}</dd>
                  <dt>ideal tomography mean ± std</dt><dd>{states.ideal_tomography.mean.toFixed(4)} ± {states.ideal_tomography.std.toFixed(4)}</dd>
                  <dt>noisy exact mean ± std</dt><dd>{states.noisy_exact.mean.toFixed(4)} ± {states.noisy_exact.std.toFixed(4)}</dd>
                  <dt>readout mitigation (cardinal avg)</dt><dd>{states.mitigation.raw.toFixed(4)} → <span className="green">{states.mitigation.mitigated.toFixed(4)}</span></dd>
                </dl>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, marginTop: 12 }}>
        <div className="panel">
          <h3>Average fidelity vs depolarizing noise <span className="grow" /><SourceBadge source="SIM" /></h3>
          {sw1 && (
            <LineChart height={240} yMin={0.5} yMax={1} xLabel="2-qubit depolarizing p₂" yLabel="average fidelity"
              series={[
                ...Object.entries(sw1.curves).map(([k, v], i) => ({ name: k, x: sw1.p2, y: v as number[], color: SERIES_COLORS[i] })),
                { name: 'analytic (CX-only)', x: sw1.p2, y: sw1.analytic_cx_only, color: '#ffffff', dashed: true, width: 1 },
              ]}
              hLines={[{ y: CLASSICAL_BOUND, label: 'classical limit 2/3', color: '#FFB020' }]}
              markers={Object.entries(sw1.crossings).filter(([, x]) => x !== null).map(([, x], i) => ({ x: x as number, y: CLASSICAL_BOUND, label: `p₂*=${(x as number).toFixed(3)}`, color: SERIES_COLORS[i] }))} />
          )}
          <div className="tip">Average fidelity is exact, from the Pauli transfer matrix: F_avg = (2·F_pro + 1)/3. The analytic CX-only curve (1 + (1−p)²)/2 overlays the simulation exactly.</div>
        </div>
        <div className="panel">
          <h3>2-D sweep p₁ × p₂ (white contour: F = 2/3)</h3>
          {sw2 && <Heatmap grid={sw2.fidelity} xs={sw2.p2} ys={sw2.p1} xLabel="p₂ (2-qubit)" yLabel="p₁ (1-qubit)" min={0.5} max={1} pivot={CLASSICAL_BOUND} contour={CLASSICAL_BOUND} height={260} />}
        </div>
        <div className="panel">
          <h3>Process: Pauli transfer matrix (noisy)</h3>
          {states && (
            <>
              <Heatmap grid={(states.cardinal_noisy_exact.ptm as number[][]).slice().reverse()} min={-1} max={1} cellText height={200}
                colLabels={['I', 'X', 'Y', 'Z']} rowLabels={['Z', 'Y', 'X', 'I']} />
              <dl className="kv">
                <dt>process fidelity</dt><dd>{states.cardinal_noisy_exact.process_fidelity.toFixed(4)}</dd>
                <dt>average fidelity</dt><dd>{states.cardinal_noisy_exact.average_fidelity.toFixed(4)}</dd>
              </dl>
            </>
          )}
          {t1 && (
            <LineChart height={130} series={[{ name: 'F', x: t1.t1_us.map((v: number) => Math.log10(v)), y: t1.fidelity, color: '#8B5CF6' }]}
              hLines={[{ y: CLASSICAL_BOUND, label: '2/3', color: '#FFB020' }]} xLabel="log₁₀ T1=T2 (µs), thermal relaxation" yMin={0.5} yMax={1} />
          )}
        </div>
      </div>
    </div>
  )
}
