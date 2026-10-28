import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { BarChart, Heatmap } from '../components/charts'
import { SourceBadge } from '../components/controls'
import { Fill, Panel } from '../components/Fill'
import { CLASSICAL_BOUND } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATES = ['|0>', '|1>', '|+>', '|->', '|+i>', '|-i>']

function SourceCard({ a, src }: { a: any; src: 'HW' | 'EMU' }) {
  const title = src === 'HW' ? 'IBM hardware' : 'Emulated device'
  if (!a) {
    return (
      <Panel title={title} right={<SourceBadge source={src} />}>
        <div className="mono amber">{src === 'HW' ? 'hardware: not available' : 'emulation: not available'}</div>
        <div className="tip" style={{ marginTop: 4 }}>
          {src === 'HW' ? <>Run <span className="mono">scripts/run_hardware.py --submit</span> with an IBM Quantum account. Results are cached in data/hardware/ with their job ID.</>
            : <>Run <span className="mono">scripts/run_hardware.py --emulate</span>.</>}
        </div>
      </Panel>
    )
  }
  return (
    <Panel title={title} right={<SourceBadge source={src} />}>
      <dl className="kv">
        <dt>backend</dt><dd>{a.backend}</dd>
        <dt>{src === 'HW' ? 'job ID' : 'run'}</dt><dd className="mono" style={{ fontSize: 10.5 }}>{src === 'HW' ? a.job_id : 'local emulation (no IBM job)'}</dd>
        <dt>time</dt><dd>{a.timestamp}</dd>
        {a.qrng && <><dt>QRNG bits</dt><dd>{a.qrng.n_bits.toLocaleString()} · {a.qrng.suite.passed}/{a.qrng.suite.total} tests</dd></>}
        {Object.entries(a.teleport ?? {}).map(([v, t]: [string, any]) => (
          <span key={v} style={{ display: 'contents' }}><dt>teleport ({v})</dt><dd className={t.average_fidelity > CLASSICAL_BOUND ? 'green' : 'red'}>F_avg {t.average_fidelity.toFixed(4)}</dd></span>
        ))}
      </dl>
      {src === 'EMU' && <div className="honesty" style={{ marginTop: 4 }}>EMULATED = simulator + a real device's noise model. Not a hardware run.</div>}
    </Panel>
  )
}

export function Hardware() {
  const [d, setD] = useState<any>(null)
  useEffect(() => { api.get('/api/hardware/results').then(setD).catch(() => null) }, [])
  if (!d) return <div className="screen tip">Loading cached results…</div>
  const sources = (['EMU', 'HW'] as const).filter((s) => d[s])
  const best = d.HW ?? d.EMU
  const variant = (a: any) => (a?.teleport?.dynamic ? 'dynamic' : 'deferred')
  const djTags: string[] = best ? best.dj.map((x: any) => x.tag) : []

  return (
    <div className="screen">
      <div className="fit" style={{ gridTemplateColumns: '1.25fr 0.9fr 1.25fr 0.9fr', gridTemplateRows: 'auto 1fr' }}>
        <Panel title="Simulator" right={<SourceBadge source="SIM" />}>
          <dl className="kv">
            <dt>backend</dt><dd>Aer (ideal)</dd>
            <dt>teleport F_avg</dt><dd className="green">1.000000000 (exact)</dd>
            <dt>DJ success</dt><dd className="green">1.000 (every function, n ≤ 3)</dd>
          </dl>
          <div className="honesty" style={{ marginTop: 4 }}>Simulator randomness is pseudo-random under the hood.</div>
        </Panel>
        <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SourceCard a={d.EMU} src="EMU" />
          <SourceCard a={d.HW} src="HW" />
        </div>
        <Panel title="What the noise means">
          <ul className="tip scroll-y" style={{ paddingLeft: 16, margin: 0 }}>
            <li>Above 2/3 = a genuinely quantum channel.</li>
            <li>Readout errors on Alice's bits cause wrong corrections, and no post-processing can undo them.</li>
            <li>Deeper oracles (more 2-qubit gates) lose accuracy fastest.</li>
          </ul>
        </Panel>

        {best ? (
          <>
            <Panel title="Teleport fidelity per state (tomography)">
              {sources.map((s) => {
                const t = d[s].teleport[variant(d[s])]
                return (
                  <div key={s} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div className="row"><SourceBadge source={s} /><span className="mono dim" style={{ fontSize: 11 }}>{d[s].backend} · {variant(d[s])}</span></div>
                    <Fill>{(w, h) => <BarChart width={w} height={h} labels={STATES.map((x) => x.replace('>', '⟩'))} values={STATES.map((k) => t.states[k]?.fidelity ?? 0)} yMax={1.08}
                      colors={STATES.map((k) => ((t.states[k]?.fidelity ?? 0) > CLASSICAL_BOUND ? (s === 'HW' ? '#B6FF6A' : '#FF8A5B') : '#FF5470'))}
                      refLine={{ y: CLASSICAL_BOUND, label: 'classical 2/3', color: '#FF8A5B' }} valueFmt={(v) => v.toFixed(3)} />}</Fill>
                  </div>
                )
              })}
            </Panel>
            <Panel title="Process matrix" right={<SourceBadge source={d.HW ? 'HW' : 'EMU'} />}>
              <Fill>{(w, h) => <Heatmap width={w} height={h} grid={(best.teleport[variant(best)].ptm as number[][]).slice().reverse()} min={-1} max={1} cellText colLabels={['I', 'X', 'Y', 'Z']} rowLabels={['Z', 'Y', 'X', 'I']} />}</Fill>
              <dl className="kv">
                <dt>process fidelity</dt><dd>{best.teleport[variant(best)].process_fidelity.toFixed(4)}</dd>
                <dt>average fidelity</dt><dd>{best.teleport[variant(best)].average_fidelity.toFixed(4)}</dd>
              </dl>
            </Panel>
            <Panel title="Deutsch–Jozsa success">
              {sources.map((s) => (
                <div key={s} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                  <div className="row"><SourceBadge source={s} /></div>
                  <Fill>{(w, h) => <BarChart width={w} height={h} labels={djTags.map((t) => t.replace('distdj_n2_', 'D·').replace('dj_n', '').replace('random_bal', 'rnd').replace('const_', 'c').replace('parity', 'par'))}
                    values={djTags.map((t) => d[s].dj.find((x: any) => x.tag === t)?.success_probability ?? 0)} yMax={1.1}
                    colors={djTags.map((t) => (t.includes('const') ? '#4DFFA6' : '#F5C84B'))} valueFmt={(v) => v.toFixed(2)} />}</Fill>
                </div>
              ))}
              <div className="tip">Labels: n_oracle (c = constant, par = parity, rnd = random balanced, D· = teleported ancilla).</div>
            </Panel>
            <Panel title="Device details">
              <div className="scroll-y tip">
                <p style={{ margin: '0 0 6px' }}>2-qubit gates after compiling for the chip:</p>
                <table className="t">
                  <tbody>{best.dj.map((x: any) => <tr key={x.tag}><td>{x.tag.replace('dj_', '')}</td><td>{x.two_qubit_gates}</td></tr>)}</tbody>
                </table>
                {best.qrng && <p style={{ marginTop: 6 }}>Per-qubit P(1) on the QRNG ranges {Math.min(...best.qrng.per_qubit_p1).toFixed(3)}–{Math.max(...best.qrng.per_qubit_p1).toFixed(3)}, which is why we fix bias with extractors.</p>}
              </div>
            </Panel>
          </>
        ) : <div className="tip">No device results cached yet.</div>}
      </div>
    </div>
  )
}
