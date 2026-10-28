import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type CircuitJson, type CompareEntry, type QrngResult } from '../lib/api'
import { BitRain, Fingerprint } from '../components/bits'
import { BarChart, LineChart } from '../components/charts'
import { CircuitView } from '../components/CircuitView'
import { Seg, SourceBadge } from '../components/controls'
import { Fill, Panel } from '../components/Fill'
import { CountUp, Story, type Chapter } from '../components/Story'
import { useStore } from '../store/useStore'
import { StatsMatrix, shortName } from './QrngLab'

/* eslint-disable @typescript-eslint/no-explicit-any */

type Mode = 'hw_cached' | 'sim' | 'emulated'
const ONE_QUBIT: CircuitJson = { num_qubits: 1, ops: [{ name: 'h', qubits: [0], params: [], condition: null }, { name: 'measure', qubits: [0], params: [], condition: null }] }

/** A qubit "coin": the arrow spins sideways, then each look lands on 0 or 1 (driven by the real bits). */
function CoinFlip({ bits }: { bits: number[] }) {
  const [k, setK] = useState(0)
  const [counts, setCounts] = useState([0, 0])
  useEffect(() => {
    const id = setInterval(() => {
      setK((x) => x + 1)
      setCounts((c) => { const b = bits[k % Math.max(1, bits.length)] ?? 0; const n = [...c]; n[b]++; return n })
    }, 650)
    return () => clearInterval(id)
  }, [bits, k])
  const b = bits[(k - 1 + bits.length) % Math.max(1, bits.length)] ?? 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', height: '100%', gap: 20 }}>
      <svg viewBox="-110 -110 220 220" style={{ width: '100%', maxHeight: '100%' }}>
        <circle r="90" fill="rgba(77,255,166,0.06)" stroke="#4DFFA6" strokeWidth="2" />
        <ellipse rx="90" ry="26" fill="none" stroke="rgba(77,255,166,0.35)" />
        <text y="-96" textAnchor="middle" fontSize="13" fill="#8FA89C">|0⟩</text>
        <text y="108" textAnchor="middle" fontSize="13" fill="#8FA89C">|1⟩</text>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="80;100;80" dur="1.3s" repeatCount="indefinite" />
          <line x1="0" y1="0" x2="0" y2="-80" stroke="#F5C84B" strokeWidth="5" strokeLinecap="round" />
          <circle cy="-80" r="7" fill="#fff" />
        </g>
      </svg>
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="muted" style={{ fontSize: 15 }}>After the H gate the gold arrow points exactly between 0 and 1. Each look forces a choice:</div>
        <div className="row" style={{ gap: 16 }}>
          {[0, 1].map((v) => (
            <motion.div key={v} animate={{ scale: b === v ? 1.08 : 1, boxShadow: b === v ? `0 0 30px ${v ? '#F5C84B' : '#4DFFA6'}` : 'none' }}
              style={{ width: 110, height: 110, borderRadius: 14, display: 'grid', placeItems: 'center', fontSize: 56, fontFamily: 'JetBrains Mono',
                border: `2px solid ${v ? '#F5C84B' : '#4DFFA6'}`, color: v ? '#F5C84B' : '#4DFFA6', background: b === v ? `${v ? '#F5C84B' : '#4DFFA6'}22` : 'transparent' }}>
              {v}
            </motion.div>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 15 }}>
          flips: <b>{counts[0] + counts[1]}</b> &nbsp; zeros: <b className="cyan">{counts[0]}</b> &nbsp; ones: <b className="magenta">{counts[1]}</b>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, decimals = 0, color }: { value: number; label: string; decimals?: number; color?: string }) {
  return (
    <div className="panel" style={{ textAlign: 'center', padding: '14px 10px' }}>
      <div className="big-number" style={color ? { color } : undefined}><CountUp to={value} decimals={decimals} /></div>
      <div className="big-label">{label}</div>
    </div>
  )
}

export function QrngStory() {
  const playTick = useStore((s) => s.tick['qrng.play'] ?? 0)
  const breakTick = useStore((s) => s.tick['qrng.break'] ?? 0)
  const [mode, setMode] = useState<Mode>('hw_cached')
  const [res, setRes] = useState<QrngResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [compare, setCompare] = useState<Record<string, CompareEntry> | null>(null)
  const [extractors, setExtractors] = useState<any>(null)
  const [randu, setRandu] = useState<CompareEntry | null>(null)
  const [hw, setHw] = useState<any>(null)

  const generate = useCallback(async (m: Mode) => {
    setErr(null)
    try { setRes(await api.post<QrngResult>('/api/qrng/generate', { n_bits: 200_000, mode: m })) }
    catch (e) {
      setErr((e as Error).message)
      if (m !== 'sim') { setMode('sim'); setRes(await api.post<QrngResult>('/api/qrng/generate', { n_bits: 200_000, mode: 'sim' })) }
    }
  }, [])
  useEffect(() => { generate(mode) }, [mode, generate])
  useEffect(() => {
    api.get<Record<string, CompareEntry>>('/api/qrng/compare').then(setCompare).catch(() => null)
    api.get('/api/qrng/extractors').then(setExtractors).catch(() => null)
    api.get<CompareEntry>('/api/qrng/randu?n_bits=200000').then(setRandu).catch(() => null)
    api.get('/api/hardware/results').then(setHw).catch(() => null)
  }, [])

  const n = res ? res.counts[0] + res.counts[1] : 0
  const sigma = Math.sqrt(n / 4)
  const srcBadge = res && <SourceBadge source={res.source} />
  const others = compare ? Object.entries(compare).filter(([k]) => !k.startsWith('RANDU')) : []
  const perQubit: number[] | undefined = hw?.HW?.qrng?.per_qubit_p1

  const chapters: Chapter[] = [
    {
      key: 'coin', title: 'A quantum coin', seconds: 11,
      text: <>A qubit normally starts as <b>0</b>. The <b>H gate</b> tips its arrow exactly sideways, halfway between 0 and 1. When we <b>look</b> at it, it has to pick: 0 or 1, each with exactly 50% chance. Not even nature knows the answer in advance. That makes it a <b>perfect coin</b>.</>,
      tip: 'The boxes on the right light up with the actual measured bits.',
      render: () => (
        <div className="stage-row" style={{ gridTemplateRows: '1fr auto' }}>
          <Panel title="Measure a sideways qubit" right={srcBadge}><Fill>{() => <CoinFlip bits={res?.preview ?? []} />}</Fill></Panel>
          <Panel title="The whole circuit: just two steps"><div style={{ height: 90 }}><CircuitView circuit={ONE_QUBIT} height={90} /></div></Panel>
        </div>
      ),
    },
    {
      key: 'many', title: 'Flip it a million times', seconds: 10,
      text: <>We don't flip one coin, we flip <b>{res?.source === 'HW' ? '100 qubits at once, 8,192 times' : 'many qubits at once, over and over'}</b>. Each column of falling digits is a stream of real measurement results. {res?.source === 'HW' ? <>These bits came from a <b>real IBM quantum computer</b> (ibm_marrakesh), so they are physically random.</> : <>These bits come from a <b>simulator</b>, which secretly uses a normal computer's pseudo-random trick.</>}</>,
      render: () => (
        <div className="stage-row" style={{ gridTemplateRows: 'auto 1fr' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Stat value={res?.source === 'HW' ? 819200 : n} label={res?.source === 'HW' ? 'hardware bits collected' : 'bits generated'} />
            <Stat value={res ? res.counts[1] / n : 0} decimals={4} label="share of ones (ideal 0.5)" color="#F5C84B" />
            <Stat value={res?.suite.entropy.shannon_per_bit ?? 0} decimals={4} label="information per bit (max 1)" />
          </div>
          <Panel title="The bit stream" right={srcBadge}><Fill>{(_, h) => <BitRain bits={res?.preview ?? []} height={h} speed={1.3} />}</Fill></Panel>
        </div>
      ),
    },
    {
      key: 'count', title: 'Is the coin fair?', seconds: 9,
      text: <>Count the zeros and ones. A fair coin gives roughly half and half, but never exactly. The <b>orange band</b> shows how much wobble pure luck allows. If a bar leaves the band, the coin is probably biased.</>,
      render: () => res && (
        <Panel title={`Zeros vs ones (${n.toLocaleString()} bits)`} right={srcBadge}>
          <Fill>{(w, h) => <BarChart width={w} height={h} labels={['0', '1']} values={res.counts} colors={['#4DFFA6', '#F5C84B']} yMax={n * 0.56}
            band={{ lo: n / 2 - 3 * sigma, hi: n / 2 + 3 * sigma, color: '#FF8A5B' }} refLine={{ y: n / 2, label: 'perfect half', color: '#FF8A5B' }} valueFmt={(v) => v.toLocaleString()} />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'walk', title: 'Take a random walk', seconds: 11,
      text: <>Imagine walking a line: <b>one step up for every 1, one step down for every 0</b>. A fair coin wanders up and down but stays inside the purple cone. A biased coin would slowly drift out of it in one direction.</>,
      tip: 'Watch the path draw itself, one step at a time.',
      render: () => res && (
        <Panel title="Random walk (up = 1, down = 0)" right={srcBadge}>
          <Fill>{(w, h) => <LineChart width={w} height={h} draw={6} xLabel="bits so far" yLabel="position"
            series={[{ name: 'walk', x: res.walk.x, y: res.walk.walk, color: '#4DFFA6', width: 1.6 }]}
            band={{ x: res.walk.x, lo: res.walk.envelope.map((e) => -3 * e), hi: res.walk.envelope.map((e) => 3 * e), color: '#8F7CFF' }} />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'rhythm', title: 'Any hidden rhythm?', seconds: 9,
      text: <>Does a bit "remember" the one before it, or the one 10 places back? We check every gap from 1 to 32. Random bits stay inside the shaded zone near zero: <b>no memory, no rhythm</b>.</>,
      render: () => res && (
        <Panel title="Autocorrelation: does a bit predict a later one?" right={srcBadge}>
          <Fill>{(w, h) => <LineChart width={w} height={h} draw={3.5} xLabel="gap between bits" yLabel="correlation"
            series={[{ name: 'r', x: res.autocorr.map((_, i) => i + 1), y: res.autocorr, color: '#B6FF6A' }]}
            band={{ x: res.autocorr.map((_, i) => i + 1), lo: res.autocorr.map(() => -3 / Math.sqrt(n)), hi: res.autocorr.map(() => 3 / Math.sqrt(n)), color: '#B6FF6A' }} />}</Fill>
        </Panel>
      ),
    },
    {
      key: 'pictures', title: 'Turn bits into pictures', seconds: 11,
      text: <>Paint each bit as a pixel: green for 1, dark for 0. <b>Random bits look like TV static.</b> Any pattern, stripes or blobs would mean the bits aren't random. Here are our quantum bits next to two famous classical random generators.</>,
      render: () => (
        <Panel title="Bit fingerprints (256 × 256 bits each)">
          <Fill>{(w, h) => {
            const items: [string, string, string][] = [
              ...(res ? [[res.source === 'HW' ? 'IBM hardware (this run)' : 'this run', res.fingerprint, res.source] as [string, string, string]] : []),
              ...others.filter(([, v]) => !(res?.source === 'HW' && v.source === 'HW')).slice(0, 3).map(([k, v]) => [shortName(k), v.fingerprint, v.source] as [string, string, string]),
            ]
            const size = Math.min((w - 30) / Math.max(items.length, 1), h - 40)
            return (
              <div className="row" style={{ justifyContent: 'space-around', height: '100%' }}>
                {items.map(([l, b, s], k) => <Fingerprint key={l} b64={b} label={l} badge={<SourceBadge source={s} />} size={size} scan={1.8} delay={k * 0.6} />)}
              </div>
            )
          }}</Fill>
        </Panel>
      ),
    },
    {
      key: 'tests', title: 'Ten detectives', seconds: 13,
      text: <>Now ten statistical <b>detectives</b> (the official US NIST tests) each look for a different kind of pattern: too many 1s, long streaks, repeating chunks, hidden waves and more. <b>Green = nothing suspicious found.</b> Red = a pattern was caught. Passing doesn't <i>prove</i> randomness; it only means no pattern was found.</>,
      tip: <>Honest result: on the first 200k hardware bits nothing is caught, but with <b>all 819,200 bits</b> two detectives spot a tiny bias (frequency and cumulative sums). More data lets them catch smaller flaws. Chapter 9 fixes it.</>,
      render: () => (
        <Panel title="Test results (each cell is a p-value; pass if ≥ 0.01)">
          <div className="scroll-y" style={{ fontSize: 13 }}>
            <StatsMatrix stagger={0.035} rows={[
              ...(res ? [{ name: res.source === 'HW' ? `IBM hardware, first ${(n / 1000).toFixed(0)}k bits` : 'This run', source: res.source, suite: res.suite }] : []),
              ...others.map(([k, v]) => ({ name: v.source === 'HW' ? `IBM hardware, all ${(v.suite.n_bits / 1000).toFixed(0)}k bits` : k, source: v.source, suite: v.suite })),
            ]} />
          </div>
        </Panel>
      ),
    },
    {
      key: 'cheat', title: 'Catch a cheater', seconds: 11,
      text: <>Do the detectives actually work? We fed them <b>RANDU</b>, a famously broken random generator from the 1960s. Its picture shows obvious <b>stripes</b>, and the detectives fail it on <b>6 of 10 tests</b>. So when quantum bits pass, it means something.</>,
      render: () => randu && (
        <div className="stage-row" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
          <Panel title="RANDU's fingerprint"><Fill>{(w, h) => <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}><Fingerprint b64={randu.fingerprint} label="RANDU" badge={<SourceBadge source="PRNG" />} size={Math.min(w, h) - 40} scan={2.2} /></div>}</Fill></Panel>
          <Panel title="RANDU vs the detectives">
            <div className="scroll-y" style={{ fontSize: 13 }}><StatsMatrix stagger={0.08} rows={[{ name: 'RANDU (low byte)', source: 'PRNG', suite: randu.suite }]} /></div>
          </Panel>
        </div>
      ),
    },
    {
      key: 'fix', title: 'Fixing an unfair coin', seconds: 14,
      text: <>Real hardware is never perfect: {perQubit ? <>on the IBM chip, each of the 100 qubits is a slightly different coin, from <b>{(Math.min(...perQubit) * 100).toFixed(1)}%</b> to <b>{(Math.max(...perQubit) * 100).toFixed(1)}%</b> ones.</> : <>each qubit is a slightly unfair coin.</>} Clever tricks called <b>extractors</b> turn unfair bits into fair ones by throwing some away. The best one (<b>Toeplitz hashing</b>) keeps the most bits and makes them pass every test.</>,
      render: () => (
        <div className="stage-row" style={{ gridTemplateColumns: perQubit ? '1.3fr 1fr' : '1fr' }}>
          {perQubit && (
            <Panel title="Every hardware qubit is a slightly different coin" right={<SourceBadge source="HW" />}>
              <Fill>{(w, h) => <BarChart width={w} height={h} labels={perQubit.map((_, i) => (i % 10 === 0 ? String(i) : ''))} values={perQubit}
                colors={perQubit.map((p) => (Math.abs(p - 0.5) > 0.03 ? '#FF8A5B' : '#4DFFA6'))} yMax={0.6} refLine={{ y: 0.5, label: 'fair = 0.5', color: '#F5C84B' }} valueFmt={() => ''} />}</Fill>
            </Panel>
          )}
          {extractors && (
            <Panel title={extractors.device ? 'Share of ones before and after fixing (hardware bits)' : 'Share of ones before and after fixing'} right={extractors.device && <SourceBadge source={extractors.device.source} />}>
              <Fill>{(w, h) => {
                const m = extractors.device?.methods ?? extractors.methods
                const keys = ['raw', 'von_neumann', 'xor', 'toeplitz']
                return <BarChart width={w} height={h} labels={['raw', 'Von Neumann', 'XOR', 'Toeplitz']} values={keys.map((k) => m[k].p1)}
                  colors={['#FF8A5B', '#4DFFA6', '#8F7CFF', '#B6FF6A']} yMax={0.6} refLine={{ y: 0.5, label: 'fair', color: '#F5C84B' }} valueFmt={(v) => v.toFixed(4)} />
              }}</Fill>
              <div className="tip">Tests passed: {['raw', 'von_neumann', 'xor', 'toeplitz'].map((k) => { const v = (extractors.device?.methods ?? extractors.methods)[k]; return `${k.replace('_', ' ')} ${v.suite ? `${v.suite.passed}/10` : '—'} (keeps ${(v.yield * 100).toFixed(0)}%)` }).join(' · ')}</div>
            </Panel>
          )}
        </div>
      ),
    },
  ]

  return (
    <Story kicker="Problem 2 · quantum random numbers" chapters={chapters} playTick={playTick + breakTick}
      controls={
        <div style={{ display: 'grid', gap: 6 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="lbl">bit source</span>
            <Seg value={mode} options={['hw_cached', 'sim', 'emulated'] as const} onChange={setMode} labels={{ hw_cached: 'IBM HW', sim: 'SIM', emulated: 'EMU' }} />
          </div>
          {err && mode === 'sim' && <div className="tip amber">Hardware bits not available, so showing simulator bits.</div>}
          {res && <div className="honesty">{res.source_label}</div>}
        </div>
      } />
  )
}
