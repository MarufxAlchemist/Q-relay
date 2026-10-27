import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { BarChart, Heatmap } from '../components/charts'
import { SourceBadge } from '../components/controls'
import { CLASSICAL_BOUND } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATES = ['|0>', '|1>', '|+>', '|->', '|+i>', '|-i>']

function SourceCard({ a, src }: { a: any; src: 'HW' | 'EMU' }) {
  if (!a) {
    return (
      <div className="panel">
        <h3>{src === 'HW' ? 'IBM hardware' : 'Emulated device'} <span className="grow" /><SourceBadge source={src} /></h3>
        <div className="mono amber">{src === 'HW' ? 'hardware: not available' : 'emulation: not available'}</div>
        <div className="tip" style={{ marginTop: 6 }}>
          {src === 'HW' ? <>Run <span className="mono">python scripts/run_hardware.py --submit</span> with an IBM Quantum account. Results are cached in data/hardware/ with their job ID.</>
            : <>Run <span className="mono">python scripts/run_hardware.py --emulate</span>.</>}
        </div>
      </div>
    )
  }
  return (
    <div className="panel">
      <h3>{src === 'HW' ? 'IBM hardware' : 'Emulated device'} <span className="grow" /><SourceBadge source={src} /></h3>
      <dl className="kv">
        <dt>backend</dt><dd>{a.backend}</dd>
        <dt>{src === 'HW' ? 'job ID' : 'run'}</dt><dd className="mono" style={{ fontSize: 10.5 }}>{src === 'HW' ? a.job_id : 'local emulation (no IBM job)'}</dd>
        <dt>timestamp</dt><dd>{a.timestamp}</dd>
        <dt>qiskit / runtime</dt><dd>{a.versions?.qiskit} / {a.versions?.qiskit_ibm_runtime}</dd>
        {a.qrng && <><dt>QRNG bits</dt><dd>{a.qrng.n_bits.toLocaleString()} · P(1)={a.qrng.p1.toFixed(4)} · {a.qrng.suite.passed}/{a.qrng.suite.total} tests</dd></>}
        {Object.entries(a.teleport ?? {}).map(([v, t]: [string, any]) => (
          <span key={v} style={{ display: 'contents' }}><dt>teleport ({v}) F_avg</dt><dd className={t.average_fidelity > CLASSICAL_BOUND ? 'green' : 'red'}>{t.average_fidelity.toFixed(4)}</dd></span>
        ))}
      </dl>
      {src === 'EMU' && <div className="honesty" style={{ marginTop: 6 }}>EMULATED = Aer with the noise model of a real device snapshot. Not a hardware run.</div>}
    </div>
  )
}

export function Hardware() {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get('/api/hardware/results').then(setD).catch(() => null) }, [])
  if (!d) return <div className="screen tip">Loading cached results…</div>
  const sources = (['EMU', 'HW'] as const).filter((s) => d[s])
  const best = d.HW ?? d.EMU
  const variant = (a: any) => a?.teleport?.dynamic ? 'dynamic' : 'deferred'
  const djTags: string[] = best ? best.dj.map((x: any) => x.tag) : []

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div className="panel">
          <h3>Simulator <span className="grow" /><SourceBadge source="SIM" /></h3>
          <dl className="kv">
            <dt>backend</dt><dd>Aer (ideal)</dd>
            <dt>teleport F_avg</dt><dd className="green">1.000000000 (exact)</dd>
            <dt>DJ success</dt><dd className="green">1.000 (exhaustive n ≤ 3)</dd>
          </dl>
          <div className="honesty" style={{ marginTop: 6 }}>Simulator randomness is pseudo-random under the hood.</div>
        </div>
        <SourceCard a={d.EMU} src="EMU" />
        <SourceCard a={d.HW} src="HW" />
      </div>

      {best && (
        <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 12, marginTop: 12 }}>
          <div className="panel">
            <h3>Teleportation fidelity per cardinal state (tomography)</h3>
            {sources.map((s) => {
              const t = d[s].teleport[variant(d[s])]
              return (
                <div key={s}>
                  <div className="row"><SourceBadge source={s} /><span className="mono dim">{d[s].backend} · {variant(d[s])} circuit</span></div>
                  <BarChart labels={STATES.map((x) => x.replace('>', '⟩'))} values={STATES.map((k) => t.states[k]?.fidelity ?? 0)} yMax={1.05} height={170}
                    colors={STATES.map((k) => ((t.states[k]?.fidelity ?? 0) > CLASSICAL_BOUND ? (s === 'HW' ? '#2EE59D' : '#FFB020') : '#FF4D5E'))}
                    refLine={{ y: CLASSICAL_BOUND, label: 'classical 2/3', color: '#FFB020' }} />
                </div>
              )
            })}
          </div>
          <div className="panel">
            <h3>Process (Pauli transfer matrix) <span className="grow" /><SourceBadge source={d.HW ? 'HW' : 'EMU'} /></h3>
            <Heatmap grid={(best.teleport[variant(best)].ptm as number[][]).slice().reverse()} min={-1} max={1} cellText height={230} colLabels={['I', 'X', 'Y', 'Z']} rowLabels={['Z', 'Y', 'X', 'I']} />
            <dl className="kv">
              <dt>process fidelity</dt><dd>{best.teleport[variant(best)].process_fidelity.toFixed(4)}</dd>
              <dt>average fidelity</dt><dd>{best.teleport[variant(best)].average_fidelity.toFixed(4)}</dd>
            </dl>
          </div>
          <div className="panel">
            <h3>Deutsch–Jozsa success probability</h3>
            {sources.map((s) => (
              <div key={s}>
                <div className="row"><SourceBadge source={s} /></div>
                <BarChart labels={djTags.map((t) => t.replace('distdj_', 'dist·').replace('dj_', '').replace('random_bal', 'rand'))}
                  values={djTags.map((t) => d[s].dj.find((x: any) => x.tag === t)?.success_probability ?? 0)} yMax={1.05} height={170}
                  colors={djTags.map((t) => (t.includes('const') ? '#22E4FF' : '#FF3DA5'))} valueFmt={(v) => v.toFixed(2)} />
              </div>
            ))}
            <div className="tip">Bar labels: n, oracle. Two-qubit gate counts after transpilation: {best.dj.map((x: any) => `${x.tag.replace('dj_', '')}=${x.two_qubit_gates}`).join(', ')}.</div>
          </div>
          <div className="panel">
            <h3>Noise discussion</h3>
            <ul className="tip" style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
              <li>Teleportation on the device needs 2 entangling gates plus corrections. Fidelity well above 2/3 certifies a genuinely quantum channel.</li>
              <li>Readout error hits twice: on Bob's tomography (fixable by confusion-matrix inversion) <i>and</i> on Alice's mid-circuit bits, which drive the wrong correction. Mitigating Bob's readout cannot undo the second.</li>
              <li>Native 2-qubit gates (ECR/CZ) plus routing SWAPs dominate the error. MCX-built random balanced oracles transpile to dozens of 2-qubit gates and degrade fastest.</li>
              <li>Under strong depolarization DJ outputs tend to uniform: constants fail, balanced oracles "pass" with 1−2⁻ⁿ by chance.</li>
              {best.qrng && <li>Per-qubit P(1) on the QRNG spans {Math.min(...best.qrng.per_qubit_p1).toFixed(3)}–{Math.max(...best.qrng.per_qubit_p1).toFixed(3)}: readout asymmetry biases individual qubits. That is why the extractors matter.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
