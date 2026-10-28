import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type DJResult, type DJStep, type OracleInfo } from '../lib/api'
import { AmplitudeBars, TruthTiles } from '../components/bits'
import { CircuitView } from '../components/CircuitView'
import { BarChart, Heatmap, LineChart } from '../components/charts'
import { Fill, Panel } from '../components/Fill'
import { NoiseSlider, Seg, SourceBadge } from '../components/controls'
import { Story, type Chapter } from '../components/Story'
import { useStore } from '../store/useStore'
import { QueryRace } from './DjLab'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Amplitude bars that start at stage `from` and animate to stage `to` shortly after mounting. */
function StageBars({ steps, from, to, n }: { steps: DJStep[]; from: number; to: number; n: number }) {
  const [k, setK] = useState(from)
  useEffect(() => { setK(from); const id = setTimeout(() => setK(to), 900); return () => clearTimeout(id) }, [from, to])
  const st = steps[k]
  return (
    <div className="stage-row" style={{ gridTemplateRows: '1fr auto' }}>
      <Panel title="One bar per possible input (height = its wave amplitude)" right={<span className="mono cyan">{st.stage.toUpperCase()}</span>}>
        <Fill>{(w, h) => <AmplitudeBars re={st.re} n={n} width={w} height={h} highlightZero={st.stage === 'interference'} />}</Fill>
      </Panel>
      <div className="panel" style={{ fontSize: 14 }}>{st.caption}<span className="mono dim" style={{ marginLeft: 10, fontSize: 11 }}>helper qubit: ({st.ancilla_bloch.map((v) => v.toFixed(1)).join(', ')}) = |−⟩, unchanged</span></div>
    </div>
  )
}

function Verdict({ res }: { res: DJResult }) {
  const c = res.verdict === 'constant' ? '#4DFFA6' : '#F5C84B'
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.2, type: 'spring' }}
      className="row" style={{ justifyContent: 'space-between', padding: '10px 16px', borderRadius: 8, border: `1px solid ${c}`, background: `${c}14` }}>
      <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '0.2em', color: c }}>{res.verdict.toUpperCase()}</span>
      <span className={res.correct ? 'green' : 'red'} style={{ fontSize: 16 }}>{res.correct ? '✓ correct, after ONE question' : '✗ wrong (noise)'}</span>
    </motion.div>
  )
}

export function DjStory() {
  const noise = useStore((s) => s.noise)
  const playTick = useStore((s) => s.tick['dj.play'] ?? 0)
  const raceTick = useStore((s) => s.tick['dj.race'] ?? 0)
  const [n, setN] = useState(3)
  const [oracles, setOracles] = useState<OracleInfo[]>([])
  const [oracle, setOracle] = useState('parity')
  const [res, setRes] = useState<DJResult | null>(null)
  const [complexity, setComplexity] = useState<any>(null)
  const [noiseData, setNoiseData] = useState<any>(null)
  const [heat, setHeat] = useState<any>(null)
  const [hw, setHw] = useState<any>(null)

  useEffect(() => {
    api.get<OracleInfo[]>(`/api/dj/oracles?n=${n}`).then(setOracles).catch(() => null)
    setOracle((o) => (o.startsWith('ip_') ? 'ip' : o))
  }, [n])
  const run = useCallback(async () => {
    try { setRes(await api.post<DJResult>('/api/dj/run', { n, oracle, noise: { level: noise }, shots: 2048 })) } catch { /* offline */ }
  }, [n, oracle, noise])
  useEffect(() => { run() }, [run])
  useEffect(() => {
    api.get('/api/dj/complexity?n_max=20').then(setComplexity).catch(() => null)
    api.get('/api/dj/noise').then(setNoiseData).catch(() => null)
    api.get('/api/dj/distributed_heatmap').then(setHeat).catch(() => null)
    api.get('/api/hardware/results').then(setHw).catch(() => null)
  }, [])

  const worst = 2 ** (n - 1) + 1
  const kind = res?.oracle.kind
  const nn = String(Math.min(Math.max(n, 2), 6))
  const nd = noiseData?.by_n?.[nn]
  const counts = res ? Object.entries(res.counts).sort((a, b) => b[1] - a[1]).slice(0, 10) : []

  const chapters: Chapter[] = [
    {
      key: 'box', title: 'The sealed box', seconds: 11,
      text: <>Imagine a <b>sealed box</b> with {2 ** n} buttons (every {n}-bit input). Press one and it answers <b>0 or 1</b>. We're promised the box is either <b>constant</b> (always the same answer) or <b>balanced</b> (exactly half 0s and half 1s). Which kind is it? Below are the secret answers inside this box; the computer is <i>not</i> allowed to look at them.</>,
      tip: 'Change the box with the controls on the left (number of bits n, and which box).',
      render: () => res && (
        <div className="stage-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Panel title="Pick a box">
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {oracles.map((o, i) => (
                <motion.button key={o.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }}
                  onClick={() => setOracle(o.name)} className="panel"
                  style={{ cursor: 'pointer', textAlign: 'left', padding: '10px 12px', color: 'var(--text)', borderColor: o.name.startsWith(oracle) ? 'var(--cyan)' : undefined }}>
                  <div style={{ fontSize: 15 }}>{o.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: o.kind === 'constant' ? 'var(--cyan)' : 'var(--magenta)' }}>{o.kind}</div>
                </motion.button>
              ))}
            </div>
          </Panel>
          <Panel title={`The secret answers (gold = 1) · this box is ${kind}`}>
            <Fill>{(w, h) => {
              const N = 2 ** n, cols = Math.min(16, 2 ** Math.ceil(Math.log2(N) / 2)), rows = Math.ceil(N / cols)
              const size = Math.max(10, Math.min(56, Math.floor(Math.min((w - 6 * cols) / cols, (h - 6 * rows) / rows))))
              return <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><TruthTiles table={res.oracle.truth_table} n={n} size={size} /></div>
            }}</Fill>
          </Panel>
        </div>
      ),
    },
    {
      key: 'classical', title: 'The normal way: one button at a time', seconds: 10,
      text: <>A normal computer presses buttons <b>one at a time</b>. If it sees a 0 and a 1, the box is balanced. But if it keeps seeing the same answer, it can't be sure until it has pressed <b>more than half</b> of them: up to <b>{worst.toLocaleString()}</b> presses here. The quantum computer needs exactly <b>one</b>.</>,
      render: () => (
        <div className="stage-row" style={{ gridTemplateRows: 'auto 1fr' }}>
          <Panel title="The race"><QueryRace n={n} go={1} /></Panel>
          <Panel title="Watch it grow: presses needed as the box gets bigger (log scale)">
            {complexity && <Fill>{(w, h) => <LineChart width={w} height={h} logY draw={4} legendPos="br" xLabel="input bits n" yLabel="presses needed"
              series={[
                { name: 'normal computer: 2^(n−1)+1', x: complexity.rows.map((r: any) => r.n), y: complexity.rows.map((r: any) => r.classical_worst), color: '#F5C84B' },
                { name: 'quantum computer: 1', x: complexity.rows.map((r: any) => r.n), y: complexity.rows.map(() => 1), color: '#4DFFA6' },
              ]} />}</Fill>}
          </Panel>
        </div>
      ),
    },
    {
      key: 'superpose', title: 'Step 1 · Ask everything at once', seconds: 9,
      text: <>The quantum computer puts its input qubits into <b>superposition</b>: one wave that covers <b>every button at the same time</b>, each with an equal bar. It also prepares one <b>helper qubit</b> in a special state called |−⟩.</>,
      render: () => res && <StageBars steps={res.steps} from={0} to={1} n={n} />,
    },
    {
      key: 'kick', title: 'Step 2 · One question flips signs', seconds: 10,
      text: <>Now the box is asked <b>once</b>, about all buttons together. Wherever the secret answer is 1, that button's bar <b>flips upside down</b>. The answer ends up in the wave's sign, not in the helper. This trick is called <b>phase kickback</b>.</>,
      render: () => res && <StageBars steps={res.steps} from={1} to={2} n={n} />,
    },
    {
      key: 'interfere', title: 'Step 3 · Waves cancel or add up', seconds: 12,
      text: <>Finally the waves are combined (<b>interference</b>). For a constant box all the bars pile onto <b>000…</b>; for a balanced box, the ups and downs <b>cancel to exactly zero</b> at 000…. So one look tells us the answer.</>,
      render: () => res && (
        <div className="stage-row" style={{ gridTemplateRows: '1fr auto' }}>
          <StageBars steps={res.steps} from={2} to={3} n={n} />
          <Verdict res={res} />
        </div>
      ),
    },
    {
      key: 'measure', title: 'Measure', seconds: 10,
      text: <>We run the circuit 2,048 times and count the outcomes. <b>All zeros</b> means constant; <b>anything else</b> means balanced. Here is the real circuit: Hadamards, one call to the box, Hadamards, measure.</>,
      render: () => res && (
        <div className="stage-row" style={{ gridTemplateRows: '1fr auto' }}>
          <Panel title="Outcomes (2,048 runs)" right={<SourceBadge source="SIM" />}>
            <Fill>{(w, h) => <BarChart width={w} height={h} labels={counts.map(([k]) => k)} values={counts.map(([, v]) => v)}
              colors={counts.map(([k]) => (/^0+$/.test(k) ? '#4DFFA6' : '#F5C84B'))} valueFmt={(v) => String(v)} />}</Fill>
          </Panel>
          <Panel title="The circuit"><div style={{ height: 130 }}><CircuitView circuit={res.circuit} height={130} /></div></Panel>
        </div>
      ),
    },
    {
      key: 'noise', title: 'Noise makes it stumble', seconds: 12,
      text: <>On noisy hardware the answer is sometimes wrong. Simple boxes (few gates) stay reliable; the complicated <b>random</b> boxes need many gates and stumble first. At very high noise everything looks random, so "balanced" is right only by luck. That's why the dashed constant lines drop the most.</>,
      render: () => nd && noiseData && (
        <Panel title={`Chance of the right answer vs noise (n = ${nn})`} right={<SourceBadge source="SIM" />}>
          <Fill>{(w, h) => <LineChart width={w} height={h} draw={4} yMin={0} yMax={1} legendPos="bl" xLabel="error rate per 2-qubit gate" yLabel="P(correct)"
            series={Object.entries(nd).map(([k, v]: [string, any], i) => ({ name: `${k} (${v.cx} gates)`, x: noiseData.levels_p2, y: v.success,
              color: ['#4DFFA6', '#6FE3C1', '#F5C84B', '#8F7CFF', '#FF8A5B', '#B6FF6A'][i % 6], dashed: v.kind === 'constant' }))} />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'teleported', title: 'A teleported helper', seconds: 12,
      text: <>In our mission, Bob's <b>helper qubit is teleported</b> from Alice. If the teleport is noisy, the helper is imperfect and the puzzle fails more often. We proved that the success rate for balanced boxes <b>equals the helper's teleport fidelity</b>. This map shows which stage hurts more: noisy teleport (up) or noisy box (right).</>,
      render: () => heat?.parity && (
        <Panel title="Success rate: teleport noise (up) vs box noise (right)" right={<SourceBadge source="SIM" />}>
          <Fill>{(w, h) => <Heatmap width={w} height={h} grid={heat.parity.success} xs={heat.parity.levels} ys={heat.parity.levels} xLabel="noise in the box (oracle)" yLabel="noise in the teleport" min={0.5} max={1} cellText />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'hw', title: 'On a real quantum computer', seconds: 13,
      text: hw?.HW ? <>We ran the puzzle on <b>IBM's {hw.HW.backend}</b>. Every one of the {hw.HW.dj.length} circuits gave the <b>right answer</b>. Simple boxes score about 99%; the complicated random boxes (dozens of gates after compiling for the chip) drop to about 86–89%, exactly the effect the noise chart predicted.</>
        : <>Hardware results will appear here once a real IBM run is cached.</>,
      render: () => hw?.HW && (
        <Panel title="Chance of the right answer on real hardware" right={<SourceBadge source="HW" />}>
          <Fill>{(w, h) => <BarChart width={w} height={h} yMax={1.1}
            labels={hw.HW.dj.map((d: any) => d.tag.replace('distdj_n2_', 'teleported·').replace('dj_n', 'n').replace('random_bal', 'random').replace('const_', 'const'))}
            values={hw.HW.dj.map((d: any) => d.success_probability)} colors={hw.HW.dj.map((d: any) => (d.truth === 'constant' ? '#4DFFA6' : '#F5C84B'))} valueFmt={(v) => v.toFixed(2)} />}</Fill>
          <div className="tip mono">{hw.HW.backend} · job {hw.HW.job_id} · green = constant box, gold = balanced box</div>
        </Panel>
      ),
    },
  ]

  return (
    <Story kicker="Problem 3 · Deutsch–Jozsa" chapters={chapters} playTick={playTick + raceTick}
      controls={
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="lbl">bits n</span><Seg value={n} options={[1, 2, 3, 4, 5, 6] as const} onChange={setN} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="lbl">box</span>
            <select value={oracles.find((o) => o.name.startsWith(oracle))?.name ?? oracle} onChange={(e) => setOracle(e.target.value)}>
              {oracles.map((o) => <option key={o.name} value={o.name}>{o.name} ({o.kind})</option>)}
            </select>
          </div>
          <NoiseSlider compact />
        </div>
      } />
  )
}
