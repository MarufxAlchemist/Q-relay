import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { LineChart } from '../components/charts'
import { CLASSICAL_BOUND } from '../store/useStore'

/* eslint-disable @typescript-eslint/no-explicit-any */

const ENDPOINTS = ['/api/versions', '/api/teleport/sweep', '/api/qrng/compare', '/api/qrng/extractors', '/api/dj/complexity',
  '/api/dj/noise', '/api/dj/distributed_heatmap', '/api/hardware/results']

const MAPPING: [string, string, string][] = [
  ['PS1', 'Teleport arbitrary state (dynamic circuit)', 'qrelay/teleport.py · Teleport Lab · notebook 01'],
  ['PS1', 'Fidelity: exact, tomography, 200 Haar states, 2/3 bound', 'teleport.exact_fidelity / run_tomography / haar_average'],
  ['PS1', 'Noise analysis + hardware', 'qrelay/noise.py · sweeps · Hardware page'],
  ['PS2', 'QRNG circuit + ≥1M bits', 'qrelay/qrng.py · QRNG Lab · notebook 02'],
  ['PS2', '10 statistical tests vs PCG64 / MT / RANDU', 'qrelay/stats.py · test matrix'],
  ['PS2', 'Bias mitigation (VN, XOR, Toeplitz)', 'qrelay/extract.py · extractor table'],
  ['PS3', 'DJ for n = 1…8, 2 constant + 4 balanced oracles', 'qrelay/dj.py · DJ Lab · notebook 03'],
  ['PS3', 'Exhaustive proof n ≤ 3, query complexity, adversary', 'tests/test_core.py · complexity chart'],
  ['PS3', 'Superposition / phase kickback / interference', 'dj.dj_steps · amplitude stepper'],
  ['∑', 'Distributed DJ with teleported ancilla', 'qrelay/distributed_dj.py · Mission Control · notebook 04'],
]

export function Report() {
  const [sweep, setSweep] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/api/teleport/sweep').then(setSweep).catch(() => null) }, [])

  const download = async () => {
    setBusy(true)
    const bundle: Record<string, unknown> = { generated: new Date().toISOString() }
    for (const e of ENDPOINTS) { try { bundle[e] = await api.get(e) } catch (err) { bundle[e] = { error: String(err) } } }
    const blob = new Blob([JSON.stringify(bundle, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'qrelay_results_bundle.json'
    a.click()
    setBusy(false)
  }
  const downloadSvgs = () => {
    document.querySelectorAll<SVGSVGElement>('.screen svg').forEach((svg, i) => {
      const s = new XMLSerializer().serializeToString(svg)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }))
      a.download = `qrelay_figure_${i + 1}.svg`
      a.click()
    })
  }
  const sw = sweep?.teleport_sweep_1d

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
        <div className="panel">
          <h3>Problem statement → where it lives</h3>
          <table className="t">
            <thead><tr><th>PS</th><th>requirement</th><th>implementation</th></tr></thead>
            <tbody>{MAPPING.map(([p, r, w], i) => <tr key={i}><td className="cyan">{p}</td><td style={{ textAlign: 'left' }}>{r}</td><td style={{ textAlign: 'left' }} className="muted">{w}</td></tr>)}</tbody>
          </table>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn magenta" onClick={download} disabled={busy}>{busy ? 'Collecting…' : 'Download results bundle (JSON)'}</button>
            <button className="btn" onClick={downloadSvgs}>Download figures on this page (SVG)</button>
          </div>
          <div className="tip" style={{ marginTop: 8 }}>
            The full written report is in docs/REPORT.md. Report figures are regenerated from real runs by scripts/build_report_figures.py. Theory and derivations are in docs/THEORY.md.
          </div>
        </div>
        <div className="panel">
          <h3>Headline result: quantum-advantage threshold</h3>
          {sw && (
            <LineChart height={240} yMin={0.5} yMax={1} xLabel="p₂" yLabel="F_avg"
              series={[{ name: 'depolarizing', x: sw.p2, y: sw.curves['depolarizing (p1 = p2/10)'], color: '#22E4FF' }]}
              hLines={[{ y: CLASSICAL_BOUND, label: '2/3', color: '#FFB020' }]}
              markers={sw.crossings['depolarizing (p1 = p2/10)'] ? [{ x: sw.crossings['depolarizing (p1 = p2/10)'], y: CLASSICAL_BOUND, label: `p₂* ≈ ${sw.crossings['depolarizing (p1 = p2/10)'].toFixed(3)}`, color: '#FF3DA5' }] : []} />
          )}
        </div>
        <div className="panel" style={{ gridColumn: 'span 2' }}>
          <h3>Honesty notes</h3>
          <ul className="tip" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
            <li>Aer is a classical simulator. Its "random" outcomes come from a classical PRNG. Only IBM-hardware bits are physically random.</li>
            <li>Every result is labelled SIM, EMU (noise model from a real device snapshot) or HW (real device, with job ID). Emulated results are never shown as hardware.</li>
            <li>Average teleportation fidelity above 2/3 is what certifies a quantum channel. 2/3 is the best any measure-and-prepare strategy can do.</li>
            <li>Passing statistical tests does not prove randomness. It means the tests found no structure.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
