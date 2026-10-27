import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api, type CompareEntry, type QrngResult, type Suite } from '../lib/api'
import { BitRain, Fingerprint } from '../components/bits'
import { BarChart, LineChart } from '../components/charts'
import { CircuitView } from '../components/CircuitView'
import { Seg, SourceBadge } from '../components/controls'
import { useStore } from '../store/useStore'

type Mode = 'sim' | 'emulated' | 'hw_cached'
type Mit = 'none' | 'vn' | 'xor' | 'toeplitz'

const SHORT: Record<string, string> = {
  'Frequency (monobit)': 'Mono', 'Block frequency': 'Block', Runs: 'Runs', 'Longest run of ones': 'LongRun',
  'Serial (2/3-bit patterns)': 'Serial', 'Approximate entropy': 'ApEn', 'Cumulative sums': 'CuSum',
  'Spectral (DFT)': 'DFT', 'Autocorrelation (lags 1-32)': 'AutoC', 'Byte chi-square': 'Byte χ²',
}

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
            <th>pass</th><th>H∞/byte</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name} <SourceBadge source={r.source} /></td>
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
              <td>{r.suite.entropy.min_entropy_per_byte.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tip" style={{ marginTop: 6 }}>
        NIST SP 800-22 style tests (our own implementation), α = 0.01. Cells show p-values. Passing means a test <i>failed to detect</i> structure. It is not a proof of randomness.
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

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1.05fr 1fr 1fr', gap: 12 }}>
        <div className="panel" style={{ gridRow: 'span 2' }}>
          <h3>Quantum random number generator <span className="grow" />{res && <SourceBadge source={res.source} />}</h3>
          <BitRain bits={res?.preview ?? []} height={170} />
          <div className="row" style={{ marginTop: 10 }}>
            <Seg value={mode} options={['sim', 'emulated', 'hw_cached'] as const} onChange={setMode} labels={{ sim: 'SIM', emulated: 'EMU', hw_cached: 'HW (cached)' }} />
            <Seg value={mit} options={['none', 'vn', 'xor', 'toeplitz'] as const} onChange={setMit} labels={{ none: 'raw', vn: 'Von Neumann', xor: 'XOR', toeplitz: 'Toeplitz' }} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <label className="lbl">bits</label>
            <Seg value={nBits} options={[50_000, 200_000, 1_000_000] as const} onChange={setNBits} labels={{ 50000: '50k', 200000: '200k', 1000000: '1M' }} />
            <button className="btn" onClick={generate} disabled={busy}>{busy ? 'Generating…' : 'Generate'}</button>
            <button className="btn red" onClick={breakPrng}>Break the PRNG</button>
          </div>
          {err && <div className="red mono" style={{ marginTop: 8, fontSize: 12 }}>{err}</div>}
          {res && (
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>source</dt><dd className="amber">{res.source_label}</dd>
              <dt>bits (raw → used)</dt><dd>{res.n_raw.toLocaleString()} → {res.n_bits.toLocaleString()} ({(res.yield * 100).toFixed(1)}%)</dd>
              <dt>P(1)</dt><dd>{(res.counts[1] / n).toFixed(5)}</dd>
              <dt>Shannon / bit</dt><dd>{res.suite.entropy.shannon_per_bit.toFixed(6)}</dd>
              <dt>min-entropy / bit</dt><dd>{res.suite.entropy.min_entropy_per_bit.toFixed(6)}</dd>
              <dt>min-entropy / byte</dt><dd>{res.suite.entropy.min_entropy_per_byte.toFixed(4)} (max 8)</dd>
            </dl>
          )}
          <h3 style={{ marginTop: 14 }}>Circuit: H then measure, one bit per qubit (4-qubit parallel version)</h3>
          {res && <CircuitView circuit={res.circuit} height={150} />}
          <div className="honesty" style={{ marginTop: 6 }}>
            Aer is a classical simulator. Its measurement outcomes come from a classical PRNG. Only HW bits are physically random.
          </div>
        </div>

        <div className="panel">
          <h3>0/1 frequency with ±3σ band</h3>
          {res && (
            <BarChart labels={['0', '1']} values={res.counts} colors={['#22E4FF', '#FF3DA5']} yMax={n * 0.56}
              band={{ lo: n / 2 - 3 * sigma, hi: n / 2 + 3 * sigma, color: '#FFB020' }}
              refLine={{ y: n / 2, label: 'n/2', color: '#FFB020' }} valueFmt={(v) => v.toLocaleString()} height={190} />
          )}
          <div className="tip">Band = n/2 ± 3·√(n/4). A fair source lands inside it about 99.7% of the time.</div>
        </div>
        <div className="panel">
          <h3>Random walk (cumulative ±1) vs ±√n envelope</h3>
          {res && (
            <LineChart height={190} series={[{ name: 'walk', x: res.walk.x, y: res.walk.walk, color: '#22E4FF', width: 1.3 }]}
              band={{ x: res.walk.x, lo: res.walk.envelope.map((e) => -3 * e), hi: res.walk.envelope.map((e) => 3 * e), color: '#8B5CF6' }}
              hLines={[{ y: 0, label: '', color: 'rgba(120,160,220,0.4)' }]} xLabel="bits" />
          )}
          <div className="tip">Shaded: ±3√n. A biased source drifts out of the envelope linearly.</div>
        </div>
        <div className="panel">
          <h3>Autocorrelation, lags 1–32</h3>
          {res && (
            <LineChart height={170} series={[{ name: 'r(k)', x: res.autocorr.map((_, i) => i + 1), y: res.autocorr, color: '#2EE59D' }]}
              band={{ x: res.autocorr.map((_, i) => i + 1), lo: res.autocorr.map(() => -3 / Math.sqrt(n)), hi: res.autocorr.map(() => 3 / Math.sqrt(n)), color: '#2EE59D' }}
              xLabel="lag k" />
          )}
        </div>
        <div className="panel">
          <h3>Bias mitigation (extractors)</h3>
          {extractors ? (
            <>
              <div className="tip" style={{ marginBottom: 6 }}>{extractors.source_description}</div>
              <table className="t">
                <thead><tr><th>method</th><th>P(1)</th><th>yield</th><th>tests</th></tr></thead>
                <tbody>
                  {Object.entries(extractors.methods).map(([k, v]: [string, any]) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                    <tr key={k}>
                      <td>{k}</td><td>{v.p1.toFixed(4)}</td><td>{(v.yield * 100).toFixed(1)}%</td>
                      <td className={v.suite?.passed === v.suite?.total ? 'green' : 'red'}>{v.suite ? `${v.suite.passed}/${v.suite.total}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tip" style={{ marginTop: 6 }}>
                VN is exactly unbiased for i.i.d. bits but keeps only p(1−p) per bit. XOR shrinks bias ε to 2ε². Toeplitz hashing keeps ≈ H∞ − 2·log(1/ε) bits per block.
              </div>
            </>
          ) : <div className="tip">Run <span className="mono">python scripts/precompute_sweeps.py</span> to populate.</div>}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Bit fingerprints: 65,536 bits as a 256×256 bitmap <span className="grow" /><span className="tip">structure = non-randomness</span></h3>
        <div className="row" style={{ gap: 18, justifyContent: 'space-around' }}>
          {res && <Fingerprint b64={res.fingerprint} label="this run" badge={<SourceBadge source={res.source} />} size={170} />}
          {compare && Object.entries(compare).map(([k, v]) => <Fingerprint key={k} b64={v.fingerprint} label={k} badge={<SourceBadge source={v.source} />} size={170} />)}
          {broken && <Fingerprint b64={broken.fingerprint} label="RANDU (live)" badge={<SourceBadge source="PRNG" />} size={170} />}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Statistical test matrix: QRNG vs classical PRNGs</h3>
        <StatsMatrix rows={rows} />
      </div>
    </div>
  )
}
