import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type DJResult, type OracleInfo } from '../lib/api'
import { AmplitudeBars, TruthTiles } from '../components/bits'
import { CircuitView } from '../components/CircuitView'
import { BarChart, Heatmap, LineChart } from '../components/charts'
import { NoiseSlider, Seg, SourceBadge } from '../components/controls'
import { useStore } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const STAGE_TITLES: Record<string, string> = {
  init: '0 · initial', superposition: '1 · superposition', oracle: '2 · phase kickback', interference: '3 · interference',
}

/** Classical counter racing to 2^(n-1)+1 while the quantum computer finishes at 1. */
function QueryRace({ n, go }: { n: number; go: number }) {
  const worst = 2 ** (n - 1) + 1
  const [c, setC] = useState(0)
  const [q, setQ] = useState(0)
  useEffect(() => {
    if (!go) return
    setC(0); setQ(0)
    const qt = setTimeout(() => setQ(1), 450)
    const dur = 2600, t0 = performance.now()
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / dur)
      setC(Math.max(1, Math.round(worst * t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); clearTimeout(qt) }
  }, [go, worst])
  const bar = (v: number, col: string, label: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px', gap: 8, alignItems: 'center' }}>
      <span className="lbl">{label}</span>
      <div style={{ height: 14, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${(v / worst) * 100}%`, height: '100%', background: col, boxShadow: `0 0 10px ${col}`, transition: 'width 0.1s' }} />
      </div>
      <span className="mono" style={{ color: col }}>{v.toLocaleString()}</span>
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {bar(q, '#22E4FF', 'quantum')}
      {bar(c, '#FF3DA5', 'classical')}
      <div className="tip">Deterministic classical worst case: 2^(n−1)+1 = {worst.toLocaleString()} queries. Verified against an adversarial oracle that answers 0 for as long as it can.</div>
    </div>
  )
}

export function DjLab() {
  const noise = useStore((s) => s.noise)
  const raceTick = useStore((s) => s.tick['dj.race'] ?? 0)
  const [n, setN] = useState(3)
  const [oracles, setOracles] = useState<OracleInfo[]>([])
  const [oracle, setOracle] = useState('parity')
  const [distributed, setDistributed] = useState(false)
  const [res, setRes] = useState<DJResult | null>(null)
  const [stage, setStage] = useState(3)
  const [race, setRace] = useState(0)
  const [complexity, setComplexity] = useState<any>(null)
  const [noiseData, setNoiseData] = useState<any>(null)
  const [heat, setHeat] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const playRef = useRef<number[]>([])

  useEffect(() => {
    api.get<OracleInfo[]>(`/api/dj/oracles?n=${n}`).then(setOracles).catch(() => null)
    setOracle((o) => (o.startsWith('ip_') ? 'ip' : o))  // inner-product names embed the n-bit mask
  }, [n])
  useEffect(() => {
    api.get('/api/dj/complexity?n_max=20').then(setComplexity).catch(() => null)
    api.get('/api/dj/noise').then(setNoiseData).catch(() => null)
    api.get('/api/dj/distributed_heatmap').then(setHeat).catch(() => null)
  }, [])

  const play = useCallback(() => {
    playRef.current.forEach(clearTimeout)
    setStage(0)
    playRef.current = [1, 2, 3].map((s) => window.setTimeout(() => setStage(s), s * 1300))
  }, [])

  const run = useCallback(async () => {
    setErr(null)
    try {
      const r = await api.post<DJResult>('/api/dj/run', { n, oracle, noise: { level: noise }, distributed, shots: 2048 })
      setRes(r); play(); setRace((x) => x + 1)
    } catch (e) { setErr((e as Error).message) }
  }, [n, oracle, noise, distributed, play])

  useEffect(() => { run() }, [n, oracle, distributed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (raceTick) { setN(5); setOracle('random'); setRace((x) => x + 1) } }, [raceTick])

  const st = res?.steps[stage]
  const countsSorted = res ? Object.entries(res.counts).sort((a, b) => b[1] - a[1]).slice(0, 12) : []
  const nd = noiseData?.by_n?.[String(Math.min(Math.max(n, 2), 6))] ?? noiseData?.by_n?.['3']

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.5fr 1fr', gap: 12 }}>
        <div className="panel">
          <h3>Oracle gallery</h3>
          <div className="row"><span className="lbl">n</span><Seg value={n} options={[1, 2, 3, 4, 5, 6, 7, 8] as const} onChange={setN} /></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10 }}>
            {oracles.map((o) => (
              <button key={o.name} onClick={() => setOracle(o.name)} className="panel"
                style={{ cursor: 'pointer', textAlign: 'left', padding: '8px 10px', borderColor: o.name.startsWith(oracle) ? 'var(--cyan)' : undefined,
                  boxShadow: o.name.startsWith(oracle) ? '0 0 12px rgba(34,228,255,0.25)' : undefined, color: 'var(--text)' }}>
                <div className="mono" style={{ fontSize: 12 }}>{o.name}</div>
                <div className="mono" style={{ fontSize: 10, color: o.kind === 'constant' ? 'var(--cyan)' : 'var(--magenta)' }}>{o.kind} · {o.cx} CX</div>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Seg value={distributed ? 'teleported' : 'local'} options={['local', 'teleported'] as const} onChange={(v) => setDistributed(v === 'teleported')} labels={{ local: 'local ancilla', teleported: 'teleported ancilla' }} />
          </div>
          <div style={{ marginTop: 10 }}><NoiseSlider compact /></div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn magenta" onClick={run}>Run (1 query)</button>
            <button className="btn" onClick={play}>Replay steps</button>
          </div>
          {err && <div className="red mono" style={{ fontSize: 11, marginTop: 6 }}>{err}</div>}
          {res && (
            <>
              <h3 style={{ marginTop: 14 }}>Truth table f(x) (lit = 1) <span className="grow" /><span className="mono dim">{2 ** n} inputs</span></h3>
              <TruthTiles table={res.oracle.truth_table} n={n} size={n <= 4 ? 30 : n <= 6 ? 18 : 11} />
            </>
          )}
        </div>

        <div className="panel">
          <h3>Input-register amplitudes <span className="grow" /><span className="mono cyan">{st ? STAGE_TITLES[st.stage] : ''}</span></h3>
          <div className="row" style={{ gap: 4, marginBottom: 6 }}>
            {res?.steps.map((s, i) => (
              <button key={s.stage} className="btn" style={{ padding: '4px 9px', opacity: i === stage ? 1 : 0.55 }} onClick={() => setStage(i)}>{STAGE_TITLES[s.stage]}</button>
            ))}
          </div>
          {st && <AmplitudeBars re={st.re} n={n} height={220} highlightZero={st.stage === 'interference'} />}
          <AnimatePresence mode="wait">
            <motion.div key={st?.stage} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ fontSize: 14, lineHeight: 1.5, minHeight: 64 }}>
              {st?.caption}
              {st && <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>ancilla Bloch vector: ({st.ancilla_bloch.map((v) => v.toFixed(2)).join(', ')}) = |−⟩, unchanged by the query</div>}
            </motion.div>
          </AnimatePresence>
          {res && (
            <AnimatePresence>
              <motion.div key={`${res.oracle.name}-${res.verdict}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="row" style={{ justifyContent: 'space-between', marginTop: 8, padding: '10px 14px', borderRadius: 6,
                  border: `1px solid ${res.verdict === 'constant' ? 'var(--cyan)' : 'var(--magenta)'}`,
                  background: res.verdict === 'constant' ? 'rgba(34,228,255,0.08)' : 'rgba(255,61,165,0.08)' }}>
                <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.2em', color: res.verdict === 'constant' ? 'var(--cyan)' : 'var(--magenta)' }}>
                  {res.verdict.toUpperCase()}
                </span>
                <span className={res.correct ? 'green' : 'red'} style={{ fontSize: 15 }}>{res.correct ? '✓ ground truth' : '✗ wrong (noise)'}</span>
                <span className="mono dim">P(0…0) exact {res.p_all_zeros_exact.toFixed(3)} · measured {res.p_all_zeros.toFixed(3)}</span>
              </motion.div>
            </AnimatePresence>
          )}
          {res && <div style={{ marginTop: 10 }}><CircuitView circuit={res.circuit} height={distributed ? 200 : 170} /></div>}
        </div>

        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          <div className="panel">
            <h3>Query race <span className="grow" /><button className="btn" style={{ padding: '3px 8px' }} onClick={() => setRace((x) => x + 1)}>race</button></h3>
            <QueryRace n={n} go={race} />
          </div>
          <div className="panel">
            <h3>Measured outcomes (2048 shots) <span className="grow" /><SourceBadge source="SIM" /></h3>
            {res && <BarChart labels={countsSorted.map(([k]) => k)} values={countsSorted.map(([, v]) => v)}
              colors={countsSorted.map(([k]) => (/^0+$/.test(k) ? '#22E4FF' : '#FF3DA5'))} height={170} valueFmt={(v) => String(v)} />}
            <div className="tip">All-zeros ⇒ constant. Anything else ⇒ balanced.</div>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12, marginTop: 12 }}>
        <div className="panel">
          <h3>Query complexity (log scale)</h3>
          {complexity && (
            <LineChart height={230} logY legendPos="br" xLabel="input bits n" yLabel="oracle queries"
              series={[
                { name: 'classical deterministic 2^(n−1)+1', x: complexity.rows.map((r: any) => r.n), y: complexity.rows.map((r: any) => r.classical_worst), color: '#FF3DA5' },
                { name: 'adversary simulation', x: complexity.rows.filter((r: any) => r.adversary).map((r: any) => r.n), y: complexity.rows.filter((r: any) => r.adversary).map((r: any) => r.adversary), color: '#FFB020', dashed: true },
                { name: 'quantum (Deutsch–Jozsa)', x: complexity.rows.map((r: any) => r.n), y: complexity.rows.map(() => 1), color: '#22E4FF' },
              ]} />
          )}
          <div className="tip">A randomized classical algorithm with k agreeing queries errs with probability ≤ 2^−(k−1). DJ is exact with 1 query.</div>
        </div>
        <div className="panel">
          <h3>Success vs noise, n = {Math.min(Math.max(n, 2), 6)} <span className="grow" /><SourceBadge source="SIM" /></h3>
          {nd && noiseData && (
            <LineChart height={230} yMin={0} yMax={1} legendPos="bl" xLabel="2-qubit depolarizing p₂ (p₁ = p₂/10)" yLabel="P(correct)"
              series={Object.entries(nd).map(([k, v]: [string, any], i) => ({
                name: `${k} (${v.cx} CX)`, x: noiseData.levels_p2, y: v.success,
                color: ['#22E4FF', '#5ab8ff', '#FF3DA5', '#8B5CF6', '#FFB020', '#2EE59D'][i % 6], dashed: v.kind === 'constant',
              }))}
              hLines={[{ y: 1 - 2 ** -Math.min(Math.max(n, 2), 6), label: 'balanced floor 1−2⁻ⁿ', color: '#56627a' }]} />
          )}
          <div className="tip">
            Deeper oracles (random balanced: many MCX) decay fastest. Caveat: under total depolarization outcomes become uniform. Balanced oracles then "succeed" with 1−2⁻ⁿ by chance, so compare against the constant curves.
          </div>
        </div>
        <div className="panel">
          <h3>Which stage hurts more? (distributed DJ, parity n=3)</h3>
          {heat?.parity && <Heatmap grid={heat.parity.success} xs={heat.parity.levels} ys={heat.parity.levels} xLabel="oracle-stage noise p₂" yLabel="teleport-stage noise p₂" min={0.5} max={1} cellText height={250} />}
          <div className="tip">With a perfect oracle, P(success | balanced) = ⟨−|ρ_anc|−⟩, the teleportation fidelity of the ancilla. Proved in THEORY.md and checked in tests.</div>
        </div>
      </div>
    </div>
  )
}
