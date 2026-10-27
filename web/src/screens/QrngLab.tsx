import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type CompareEntry, type QrngResult, type Suite } from '../lib/api'
import { BitRain, Fingerprint } from '../components/bits'
import { BarChart, LineChart } from '../components/charts'
import { CircuitView } from '../components/CircuitView'
import { Seg, SourceBadge } from '../components/controls'
import { Fill, Panel } from '../components/Fill'
import { useStore } from '../store/useStore'

type Mode = 'sim' | 'emulated' | 'hw_cached'
type Mit = 'none' | 'vn' | 'xor' | 'toeplitz'

const SHORT: Record<string, string> = {
  'Frequency (monobit)': 'Mono', 'Block frequency': 'Block', Runs: 'Runs', 'Longest run of ones': 'LongRun',
  'Serial (2/3-bit patterns)': 'Serial', 'Approximate entropy': 'ApEn', 'Cumulative sums': 'CuSum',
  'Spectral (DFT)': 'DFT', 'Autocorrelation (lags 1-32)': 'AutoC', 'Byte chi-square': 'Byte χ²',
}

const shortName = (n: string) => n.replace(' (Aer simulator)', '').replace(' (NumPy)', '').replace('Mersenne Twister', 'MT19937')
  .replace(' (low byte)', '').replace(/^QRNG \((\w+), (\w+)\)$/, 'QRNG $1').replace(/^This run \(.*\)$/, 'This run').replace(' (live, Break the PRNG)', ' live')

function StatsMatrix({ rows }: { rows: { name: string; source: string; suite: Suite }[] }) {
  if (!rows.length) return null
  const tests = rows[0].suite.tests.map((t) => t.name)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="t">
        <thead>
          <tr>
            <th>generator</th>
            {tests.map((t) => <th key={t} title={t} style={{ textAlign: 'center' }}>{SHORT[t] ?? t}</th>)}
            <th>pass</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td style={{ whiteSpace: 'nowrap' }}>{shortName(r.name)} <SourceBadge source={r.source} /></td>
              {r.suite.tests.map((t) => (
                <td key={t.name} title={`${t.name}: p = ${t.p_value?.toExponential(3)}\n${t.detail}`} style={{ textAlign: 'center', padding: 2 }}>
                  <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    style={{ borderRadius: 3, padding: '3px 0', fontSize: 10,
                      background: t.passed ? 'rgba(46,229,157,0.16)' : 'rgba(255,77,94,0.3)',
                      color: t.passed ? 'var(--green)' : 'var(--red)', border: `1px solid ${t.passed ? 'rgba(46,229,157,0.35)' : 'var(--red)'}` }}>
                    {t.p_value === null ? '—' : t.p_value < 0.0001 ? '<1e-4' : t.p_value.toFixed(3)}
                  </motion.div>
                </td>
              ))}
              <td className={r.suite.passed === r.suite.total ? 'green' : 'red'}>{r.suite.passed}/{r.suite.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tip" style={{ marginTop: 6 }}>
        Cells = p-values (pass ≥ 0.01). A pass means no pattern was found. It is not proof of randomness.
      </div>
    </div>
  )
}

export function QrngLab() {
  const globalMode = useStore((s) => s.mode)
  const breakTick = useStore((s) => s.tick['qrng.break'] ?? 0)
  const [mode, setMode] = useState<Mode>(globalMode === 'HW' ? 'hw_cached' : globalMode === 'EMU' ? 'emulated' : 'sim')
  const [mit, setMit] = useState<Mit>('none')
  const [nBits, setNBits] = useState(200_000)
  const [res, setRes] = useState<QrngResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [compare, setCompare] = useState<Record<string, CompareEntry> | null>(null)
  const [extractors, setExtractors] = useState<any>(null) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [broken, setBroken] = useState<CompareEntry | null>(null)

  const generate = useCallback(async () => {
    setBusy(true); setErr(null)
    try { setRes(await api.post<QrngResult>('/api/qrng/generate', { n_bits: nBits, mode, mitigate: mit })) }
    catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }, [nBits, mode, mit])

  useEffect(() => { generate() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    api.get<Record<string, CompareEntry>>('/api/qrng/compare').then(setCompare).catch(() => setCompare(null))
    api.get('/api/qrng/extractors').then(setExtractors).catch(() => null)
  }, [])
  const breakPrng = useCallback(async () => {
    setBroken(await api.get<CompareEntry>('/api/qrng/randu?n_bits=200000'))
  }, [])
  useEffect(() => { if (breakTick) breakPrng() }, [breakTick, breakPrng])

  const n = res ? res.counts[0] + res.counts[1] : 0
  const sigma = Math.sqrt(n * 0.25)
  const rows = [
    ...(res ? [{ name: `This run (${res.backend}${res.mitigate !== 'none' ? `, ${res.mitigate}` : ''})`, source: res.source, suite: res.suite }] : []),
    ...(compare ? Object.entries(compare).map(([k, v]) => ({ name: k, source: v.source, suite: v.suite })) : []),
    ...(broken ? [{ name: 'RANDU (live, Break the PRNG)', source: 'PRNG', suite: broken.suite }] : []),
  ]

  const prints: [string, string, string][] = [
    ...(res ? [['this run', res.fingerprint, res.source] as [string, string, string]] : []),
    ...(compare ? Object.entries(compare).map(([k, v]) => [shortName(k), v.fingerprint, v.source] as [string, string, string]) : []),
    ...(broken ? [['RANDU (live)', broken.fingerprint, 'PRNG'] as [string, string, string]] : []),
  ]

  return (
    <div className="screen">
      <div className="fit" style={{
        gridTemplateColumns: '1fr 1fr 1fr 1.35fr', gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: '"gen hist walk finger" "gen auto extr matrix"',
      }}>
        <Panel title="Quantum random number generator" right={res && <SourceBadge source={res.source} />} style={{ gridArea: 'gen' }}>
          <div style={{ height: 120, flexShrink: 0 }}><BitRain bits={res?.preview ?? []} height={120} /></div>
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <Seg value={mode} options={['sim', 'emulated', 'hw_cached'] as const} onChange={setMode} labels={{ sim: 'SIM', emulated: 'EMU', hw_cached: 'HW' }} />
            <Seg value={mit} options={['none', 'vn', 'xor', 'toeplitz'] as const} onChange={setMit} labels={{ none: 'raw', vn: 'VN', xor: 'XOR', toeplitz: 'Toeplitz' }} />
          </div>
          <div className="row" style={{ marginTop: 6, gap: 6 }}>
            <Seg value={nBits} options={[50_000, 200_000, 1_000_000] as const} onChange={setNBits} labels={{ 50000: '50k', 200000: '200k', 1000000: '1M' }} />
            <button className="btn" onClick={generate} disabled={busy}>{busy ? '…' : 'Generate'}</button>
            <button className="btn red" onClick={breakPrng}>Break the PRNG</button>
          </div>
          {err && <div className="red mono" style={{ marginTop: 4, fontSize: 11 }}>{err}</div>}
          {res && (
            <dl className="kv" style={{ marginTop: 6 }}>
              <dt>source</dt><dd className="amber" style={{ fontSize: 10.5 }}>{res.source_label}</dd>
              <dt>bits used</dt><dd>{res.n_bits.toLocaleString()} ({(res.yield * 100).toFixed(1)}%)</dd>
              <dt>P(1)</dt><dd>{(res.counts[1] / n).toFixed(5)}</dd>
              <dt>Shannon / bit</dt><dd>{res.suite.entropy.shannon_per_bit.toFixed(6)}</dd>
              <dt>min-entropy / byte</dt><dd>{res.suite.entropy.min_entropy_per_byte.toFixed(3)} / 8</dd>
            </dl>
          )}
          <h3 style={{ marginTop: 8 }}>Circuit: H then measure</h3>
          {res && <Fill minH={60}>{(_, h) => <CircuitView circuit={res.circuit} height={Math.min(h, 150)} />}</Fill>}
          <div className="honesty">Simulator bits come from a classical PRNG inside Aer. Only HW bits are physically random.</div>
        </Panel>

        <Panel title="0 / 1 counts with ±3σ band" style={{ gridArea: 'hist' }}>
          {res && <Fill>{(w, h) => (
            <BarChart width={w} height={h} labels={['0', '1']} values={res.counts} colors={['#22E4FF', '#FF3DA5']} yMax={n * 0.56}
              band={{ lo: n / 2 - 3 * sigma, hi: n / 2 + 3 * sigma, color: '#FFB020' }} refLine={{ y: n / 2, label: 'n/2', color: '#FFB020' }} valueFmt={(v) => v.toLocaleString()} />
          )}</Fill>}
        </Panel>
        <Panel title="Random walk vs ±3√n" style={{ gridArea: 'walk' }}>
          {res && <Fill>{(w, h) => (
            <LineChart width={w} height={h} series={[{ name: 'walk', x: res.walk.x, y: res.walk.walk, color: '#22E4FF', width: 1.3 }]}
              band={{ x: res.walk.x, lo: res.walk.envelope.map((e) => -3 * e), hi: res.walk.envelope.map((e) => 3 * e), color: '#8B5CF6' }} xLabel="bits" />
          )}</Fill>}
        </Panel>
        <Panel title="Bit fingerprints (structure = not random)" style={{ gridArea: 'finger' }}>
          <Fill>{(w, h) => {
            const cols = prints.length > 6 ? 4 : Math.min(3, prints.length || 1), rows = Math.ceil((prints.length || 1) / cols)
            const size = Math.max(40, Math.min((w - 10 * cols) / cols, (h - 34 * rows) / rows))
            return (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, justifyItems: 'center' }}>
                {prints.map(([label, b64, src]) => <Fingerprint key={label} b64={b64} label={label} badge={<SourceBadge source={src} />} size={size} />)}
              </div>
            )
          }}</Fill>
        </Panel>
        <Panel title="Autocorrelation, lags 1–32" style={{ gridArea: 'auto' }}>
          {res && <Fill>{(w, h) => (
            <LineChart width={w} height={h} series={[{ name: 'r(k)', x: res.autocorr.map((_, i) => i + 1), y: res.autocorr, color: '#2EE59D' }]}
              band={{ x: res.autocorr.map((_, i) => i + 1), lo: res.autocorr.map(() => -3 / Math.sqrt(n)), hi: res.autocorr.map(() => 3 / Math.sqrt(n)), color: '#2EE59D' }} xLabel="lag" />
          )}</Fill>}
        </Panel>
        <Panel title="Bias fixing (extractors)" style={{ gridArea: 'extr' }}>
          {extractors ? (
            <div className="scroll-y">
              <div className="tip">{extractors.source_description}</div>
              <table className="t" style={{ marginTop: 4 }}>
                <thead><tr><th>method</th><th>P(1)</th><th>yield</th><th>tests</th></tr></thead>
                <tbody>
                  {Object.entries(extractors.methods).map(([k, v]: [string, any]) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                    <tr key={k}>
                      <td>{k}</td><td>{v.p1.toFixed(4)}</td><td>{(v.yield * 100).toFixed(0)}%</td>
                      <td className={v.suite?.passed === v.suite?.total ? 'green' : 'red'}>{v.suite ? `${v.suite.passed}/${v.suite.total}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tip" style={{ marginTop: 4 }}>VN: exact but wasteful. XOR: cheap, bias only shrinks. Toeplitz: keeps the most bits, provably.</div>
            </div>
          ) : <div className="tip">Run scripts/precompute_sweeps.py to populate.</div>}
        </Panel>
        <Panel title="Statistical tests: QRNG vs classical" style={{ gridArea: 'matrix' }}>
          <div className="scroll-y"><StatsMatrix rows={rows} /></div>
        </Panel>
      </div>
    </div>
  )
}
