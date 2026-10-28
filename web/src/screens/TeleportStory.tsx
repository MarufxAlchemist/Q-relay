import { useCallback, useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { motion } from 'framer-motion'
import { api, type TeleportResult, type Vec3 } from '../lib/api'
import { BlochSphere } from '../scenes/BlochSphere'
import { Effects } from '../scenes/MissionScene'
import { Stars } from '../scenes/Stars'
import { anglesToBloch, blochToAngles, fromThree } from '../lib/three'
import { BitLamp, FidelityGauge, NoiseSlider, SourceBadge } from '../components/controls'
import { CircuitView, GATE_TO_OPS, TELEPORT_CIRCUIT } from '../components/CircuitView'
import { BarChart, Heatmap, Histogram, LineChart } from '../components/charts'
import { Fill, Panel } from '../components/Fill'
import { CountUp, Story, type Chapter } from '../components/Story'
import { CLASSICAL_BOUND, useStore } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const CARD: [string, number, number][] = [
  ['|0⟩', 0, 0], ['|1⟩', Math.PI, 0], ['|+⟩', Math.PI / 2, 0], ['|−⟩', Math.PI / 2, Math.PI], ['|+i⟩', Math.PI / 2, Math.PI / 2],
]
const STATES = ['|0>', '|1>', '|+>', '|->', '|+i>', '|-i>']
const COLORS = ['#4DFFA6', '#F5C84B', '#FF8A5B']

/** The three Bloch spheres, auto-stepping through protocol steps [from..to] (indices into res.steps). */
function StepperView({ res, from, to, input, onDrag, showGauge }: {
  res: TeleportResult | null; from: number; to: number; input: Vec3; onDrag?: (t: number, p: number) => void; showGauge?: boolean
}) {
  const low = useStore((s) => s.lowPower)
  const [k, setK] = useState(from)
  useEffect(() => {
    setK(from)
    if (to <= from) return
    const id = setInterval(() => setK((x) => (x < to ? x + 1 : x)), 1700)
    return () => clearInterval(id)
  }, [from, to])
  const s = res?.steps[Math.min(k, (res?.steps.length ?? 1) - 1)]
  const measured = res && k >= 6 ? res.steps[6].outcome : null
  return (
    <div className="stage-row" style={{ gridTemplateRows: '1fr auto' }}>
      <section className="panel flex" style={{ padding: 0 }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Canvas dpr={low ? 1 : [1, 2]} camera={{ position: [0, 0.3, 8.6], fov: 36 }}>
            <color attach="background" args={['#020604']} />
            <ambientLight intensity={0.5} />
            <Stars count={900} />
            <BlochSphere vector={k <= 1 ? input : s?.bloch[0] ?? input} position={[-3.1, 0.15, 0]} scale={1.2} label={onDrag ? 'ALICE · drag the arrow' : 'ALICE · q0'}
              onDrag={onDrag ? (p) => { const a = blochToAngles(fromThree(p)); onDrag(a.theta, a.phi) } : undefined} />
            <BlochSphere vector={s?.bloch[1] ?? [0, 0, 1]} position={[0, 0.15, 0]} scale={0.8} color="#8F7CFF" label="Alice's half of the pair" dim trail={false} showLabels={false} />
            <BlochSphere vector={s?.bloch[2] ?? [0, 0, 1]} position={[3.1, 0.15, 0]} scale={1.2} color="#F5C84B" ghost={k >= 8 ? input : null} label="BOB · q2" />
            <Effects />
          </Canvas>
          {measured && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="row" style={{ position: 'absolute', top: 10, left: 14, gap: 12 }}>
              <BitLamp bit={measured.m0} label="bit 1 → Z fix" />
              <BitLamp bit={measured.m1} label="bit 2 → X fix" />
            </motion.div>
          )}
          {showGauge && k >= to && res && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} style={{ position: 'absolute', top: 8, right: 12 }}>
              <FidelityGauge value={res.exact.fidelity} size={130} />
            </motion.div>
          )}
          {s && <div className="caption-bar" style={{ fontSize: 15, bottom: 8, padding: '7px 14px' }}>{s.caption}</div>}
        </div>
      </section>
      <Panel title="The circuit (the glowing gate is happening now)"><div style={{ height: 100 }}><CircuitView circuit={TELEPORT_CIRCUIT} highlight={s ? GATE_TO_OPS[s.gate] ?? [] : []} qubitLabels={['Alice ψ', 'Alice pair', 'Bob pair']} height={100} /></div></Panel>
    </div>
  )
}

export function TeleportStory() {
  const noise = useStore((s) => s.noise)
  const [theta, setTheta] = useState(1.1)
  const [phi, setPhi] = useState(0.8)
  const [res, setRes] = useState<TeleportResult | null>(null)
  const [sweep, setSweep] = useState<any>(null)
  const [hw, setHw] = useState<any>(null)
  const reqId = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  const run = useCallback(async (body: Record<string, unknown>) => {
    const id = ++reqId.current
    try {
      const r = await api.post<TeleportResult>('/api/teleport/run', { noise: { level: noise }, shots: 2048, ...body })
      if (id !== reqId.current) return
      setRes(r)
      if (body.random) { setTheta(r.theta); setPhi(r.phi) }
    } catch { /* offline overlay */ }
  }, [noise])
  useEffect(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => run({ theta, phi }), 200)
    return () => window.clearTimeout(timer.current)
  }, [theta, phi, run])
  useEffect(() => {
    api.get('/api/teleport/sweep').then(setSweep).catch(() => null)
    api.get('/api/hardware/results').then(setHw).catch(() => null)
  }, [])

  const input = anglesToBloch(theta, phi)
  const drag = (t: number, p: number) => { setTheta(t); setPhi(p) }
  const sw1 = sweep?.teleport_sweep_1d, sw2 = sweep?.teleport_sweep_2d, states = sweep?.teleport_states
  const hwTele = hw?.HW?.teleport

  const chapters: Chapter[] = [
    {
      key: 'secret', title: "Alice's secret qubit", seconds: 10,
      text: <>Alice holds one qubit in a secret state: the <b>arrow on the left</b>. She wants Bob, far away, to have exactly the same state. Two rules of nature make this hard: she <b>can't copy</b> a qubit, and she <b>can't look</b> at it without destroying it.</>,
      tip: 'Drag the arrow on the left sphere, or pick a preset state below it.',
      render: () => (
        <>
          <StepperView res={res} from={1} to={1} input={input} onDrag={drag} />
          <div className="row" style={{ position: 'absolute', bottom: 132, left: 12, gap: 6 }}>
            <button className="btn magenta" onClick={() => run({ random: true })}>Random from QRNG</button>
            {CARD.map(([c, t, f]) => <button key={c} className="btn" style={{ padding: '4px 8px' }} onClick={() => drag(t, f)}>{c}</button>)}
          </div>
        </>
      ),
    },
    {
      key: 'pair', title: 'Share a linked pair', seconds: 9,
      text: <>Before parting, Alice and Bob create a <b>pair of entangled qubits</b> (purple and gold) and each keeps one. Watch both arrows <b>shrink to nothing</b>: on its own, half of an entangled pair is completely uncertain. All the information lives in the link between them.</>,
      render: () => <StepperView res={res} from={1} to={3} input={input} />,
    },
    {
      key: 'measure', title: 'Alice measures', seconds: 9,
      text: <>Alice lets her secret qubit interact with her half of the pair, then <b>measures both</b>. She gets <b>two ordinary bits</b> (the lamps). Her secret qubit is now destroyed: its arrow snaps to up or down. The state wasn't copied; it is about to be <b>moved</b>.</>,
      render: () => <StepperView res={res} from={3} to={6} input={input} />,
    },
    {
      key: 'bob', title: 'Bob fixes his qubit', seconds: 11,
      text: <>Alice phones Bob the two bits. They're ordinary information, so nothing travels faster than light. Depending on the bits, Bob flips his qubit (X) and/or rotates it (Z). His arrow <b>lands exactly on the white ghost</b>, which is Alice's original. The <b>score (fidelity)</b> shows how close it is: 1 means perfect.</>,
      render: () => <StepperView res={res} from={6} to={10} input={input} showGauge />,
    },
    {
      key: 'check', title: 'Does it always work?', seconds: 10,
      text: <>Alice's measurement has <b>four possible results</b>, chosen by chance. We computed Bob's exact state in <b>every one</b>, and in every case it matches Alice's original perfectly. A lab would check by measuring Bob many times from three directions ("tomography"), which gives the same answer.</>,
      render: () => res && (
        <div className="stage-row" style={{ gridTemplateRows: 'auto 1fr' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <div className="panel" style={{ textAlign: 'center', padding: 14 }}><div className="big-number"><CountUp to={res.exact.fidelity} decimals={4} /></div><div className="big-label">exact fidelity</div></div>
            <div className="panel" style={{ textAlign: 'center', padding: 14 }}><div className="big-number" style={{ color: '#F5C84B' }}><CountUp to={res.tomography.fidelity} decimals={4} /></div><div className="big-label">measured by tomography ({res.tomography.shots} shots × 3)</div></div>
          </div>
          <Panel title="All four outcomes of Alice's measurement">
            <table className="t" style={{ fontSize: 15 }}>
              <thead><tr><th>Alice's two bits</th><th>how often</th><th>Bob's fix</th><th>fidelity</th></tr></thead>
              <tbody>
                {Object.entries(res.exact.branches).sort().map(([k, v], i) => {
                  const m0 = k.includes('m0=1'), m1 = k.includes('m1=1')
                  return (
                    <motion.tr key={k} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.4 }}>
                      <td>{k}</td><td>{(v.probability * 100).toFixed(0)}%</td><td>{[m1 && 'X', m0 && 'Z'].filter(Boolean).join(' then ') || 'nothing'}</td>
                      <td className={v.fidelity > CLASSICAL_BOUND ? 'green' : 'red'}>{v.fidelity.toFixed(6)}</td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </Panel>
        </div>
      ),
    },
    {
      key: 'many', title: '200 random states', seconds: 10,
      text: <>To be sure it works for <b>any</b> state, we teleported <b>200 random states</b> picked with our quantum random numbers. Left: measured like a real lab, so tiny spread from counting noise around 0.99. Right: with simulated hardware noise, still far above the <b>2/3 line</b>.</>,
      render: () => states && (
        <div className="stage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Panel title="Ideal channel, measured by tomography"><Fill>{(w, h) => <Histogram width={w} height={h} values={states.ideal_tomography.fidelities} min={0.95} max={1.0} color="#4DFFA6" xLabel="fidelity" />}</Fill></Panel>
          <Panel title="With realistic noise (exact)"><Fill>{(w, h) => <Histogram width={w} height={h} values={states.noisy_exact.fidelities} min={0.5} max={1} color="#F5C84B" refLine={{ x: CLASSICAL_BOUND, label: '2/3', color: '#FF8A5B' }} xLabel="fidelity" />}</Fill></Panel>
        </div>
      ),
    },
    {
      key: 'noise', title: 'Turn up the noise', seconds: 12,
      text: <>Real quantum chips make small errors on every operation. As the error rate grows, the fidelity falls. The <b>orange line at 2/3</b> is the best you could ever do by just describing the qubit over the phone. Where a curve crosses it (the circles), <b>the quantum advantage is gone</b>. The dashed white curve is our hand-derived formula; it sits exactly on the simulation.</>,
      tip: 'Move the Noise slider (left) and go back to chapter 4 to watch Bob miss the ghost.',
      render: () => sw1 && (
        <Panel title="Average fidelity vs noise" right={<SourceBadge source="SIM" />}>
          <Fill>{(w, h) => <LineChart width={w} height={h} draw={4} yMin={0.5} yMax={1} legendPos="tr" xLabel="error rate per 2-qubit gate" yLabel="average fidelity"
            series={[...Object.entries(sw1.curves).map(([k, v], i) => ({ name: k, x: sw1.p2, y: v as number[], color: COLORS[i] })),
              { name: 'our formula (CX errors only)', x: sw1.p2, y: sw1.analytic_cx_only, color: '#ffffff', dashed: true, width: 1 }]}
            hLines={[{ y: CLASSICAL_BOUND, label: 'classical limit 2/3', color: '#FF8A5B' }]}
            markers={Object.entries(sw1.crossings).filter(([, x]) => x !== null).map(([, x], i) => ({ x: x as number, y: CLASSICAL_BOUND, label: (x as number).toFixed(2), color: COLORS[i] }))} />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'map', title: 'The noise map', seconds: 10,
      text: <>There are two kinds of errors: on single-qubit gates (up) and on two-qubit gates (right). Every square is one combination. <b>Green = still quantum</b>, red = worse than classical. The white line is the border at 2/3.</>,
      render: () => sw2 && (
        <Panel title="Fidelity for every mix of errors"><Fill>{(w, h) => <Heatmap width={w} height={h} grid={sw2.fidelity} xs={sw2.p2} ys={sw2.p1} xLabel="2-qubit gate error" yLabel="1-qubit gate error" min={0.5} max={1} pivot={CLASSICAL_BOUND} contour={CLASSICAL_BOUND} />}</Fill></Panel>
      ),
    },
    {
      key: 'hw', title: 'On a real quantum computer', seconds: 14,
      text: hwTele ? <>We ran it on <b>IBM's ibm_marrakesh</b> quantum computer. With the "deferred" circuit the average fidelity was <b>{hwTele.deferred?.average_fidelity.toFixed(3)}</b>; with real mid-circuit measurement and live corrections ("dynamic") it was <b>{hwTele.dynamic?.average_fidelity.toFixed(3)}</b>. Both are <b>far above 2/3</b>: genuine quantum teleportation on real hardware. The dynamic version loses a bit on "sideways" states because the qubit waits while the measurement result travels.</>
        : <>Hardware results will appear here once a real IBM run is cached.</>,
      render: () => hwTele && (
        <div className="stage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {(['deferred', 'dynamic'] as const).filter((v) => hwTele[v]).map((v) => (
            <Panel key={v} title={`${v === 'dynamic' ? 'Dynamic (live corrections)' : 'Deferred (corrections as gates)'} · F_avg ${hwTele[v].average_fidelity.toFixed(3)}`} right={<SourceBadge source="HW" />}>
              <Fill>{(w, h) => <BarChart width={w} height={h} labels={STATES.map((s) => s.replace('>', '⟩'))} values={STATES.map((s) => hwTele[v].states[s]?.fidelity ?? 0)} yMax={1.08}
                colors={STATES.map((s) => ((hwTele[v].states[s]?.fidelity ?? 0) > CLASSICAL_BOUND ? '#4DFFA6' : '#FF5470'))}
                refLine={{ y: CLASSICAL_BOUND, label: 'classical 2/3', color: '#FF8A5B' }} valueFmt={(x) => x.toFixed(3)} />}</Fill>
              <div className="tip mono">{hw.HW.backend} · job {hw.HW.job_id}</div>
            </Panel>
          ))}
        </div>
      ),
    },
  ]

  return <Story kicker="Problem 1 · quantum teleportation" chapters={chapters} controls={<NoiseSlider compact />} />
}
