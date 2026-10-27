import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../lib/api'
import { TruthTiles } from '../components/bits'
import { FidelityGauge, NoiseSlider, Seg } from '../components/controls'
import { useStore } from '../store/useStore'

interface GameInfo { game_id: string; n: number; inputs: number; classical_worst: number }
interface QuantumAnswer {
  verdict: string; measured: string; queries: number; truth: string; correct: boolean; teleport_fidelity: number
  bob_verdict: string; oracle: { truth_table: number[]; name: string }; classical_queries_used: number
}

export function Game() {
  const noise = useStore((s) => s.noise)
  const [n, setN] = useState(5)
  const [game, setGame] = useState<GameInfo | null>(null)
  const [known, setKnown] = useState<(number | null)[]>([])
  const [certain, setCertain] = useState<string | null>(null)
  const [guess, setGuess] = useState<string | null>(null)
  const [qa, setQa] = useState<QuantumAnswer | null>(null)
  const [busy, setBusy] = useState(false)

  const newGame = useCallback(async () => {
    const g = await api.post<GameInfo>('/api/game/new', { n })
    setGame(g); setKnown(new Array(g.inputs).fill(null)); setCertain(null); setGuess(null); setQa(null)
  }, [n])
  useEffect(() => { newGame() }, [newGame])

  const query = async (x: number) => {
    if (!game || known[x] !== null || qa) return
    const r = await api.post<{ fx: number; certain: string | null }>('/api/game/query', { game_id: game.game_id, x })
    setKnown((k) => k.map((v, i) => (i === x ? r.fx : v)))
    setCertain(r.certain)
  }
  const askQuantum = async () => {
    if (!game) return
    setBusy(true)
    setQa(await api.post<QuantumAnswer>('/api/game/quantum', { game_id: game.game_id, noise: { level: noise } }))
    setBusy(false)
  }

  const used = known.filter((v) => v !== null).length
  const worst = game?.classical_worst ?? 0
  const table = qa ? qa.oracle.truth_table : known

  return (
    <div className="screen">
      <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
        <div className="panel">
          <h3>Beat the Oracle <span className="grow" />
            <Seg value={n} options={[4, 5, 6] as const} onChange={setN} />
            <button className="btn" onClick={newGame}>New oracle</button>
          </h3>
          <p style={{ marginTop: 0, fontSize: 15 }}>
            The QRNG secretly picked a function on <b className="cyan">{n}</b> bits that is either <b className="cyan">constant</b> or <b className="magenta">balanced</b>.
            Click tiles to query inputs one at a time, the classical way. How many queries until you are <i>certain</i>?
          </p>
          <TruthTiles table={table} n={n} onTile={qa ? undefined : query} size={n === 6 ? 34 : 44} />
          <div className="row" style={{ marginTop: 14, gap: 24 }}>
            <div>
              <div className="lbl">queries used</div>
              <div className="mono" style={{ fontSize: 34, color: used >= worst ? 'var(--red)' : 'var(--magenta)' }}>{used}</div>
            </div>
            <div>
              <div className="lbl">worst-case to be certain</div>
              <div className="mono" style={{ fontSize: 34, color: 'var(--amber)' }}>{worst}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${(used / Math.max(worst, 1)) * 100}%`, height: '100%', background: 'var(--magenta)', transition: 'width .2s' }} />
              </div>
              <div className="tip" style={{ marginTop: 6 }}>
                {certain ? <span className="green">Certain: {certain.toUpperCase()} after {used} classical queries.</span>
                  : used > 0 ? 'Not certain yet. Every answer so far is consistent with both hypotheses.' : 'Pick any tile.'}
              </div>
            </div>
          </div>
          {!certain && !qa && used > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="lbl">or guess now:</span>
              <button className="btn" onClick={() => setGuess('constant')}>constant</button>
              <button className="btn magenta" onClick={() => setGuess('balanced')}>balanced</button>
              {guess && <span className="mono amber">you guessed {guess}. Reveal with the quantum computer.</span>}
            </div>
          )}
        </div>

        <div className="grid" style={{ gap: 12, alignContent: 'start' }}>
          <div className="panel">
            <h3>Ask the quantum computer</h3>
            <p className="tip" style={{ marginTop: 0 }}>Deutsch–Jozsa answers with exactly <b>one</b> oracle query. The 1-bit verdict is then teleported to Bob's screen (|0⟩ = constant, |1⟩ = balanced) through the noisy channel.</p>
            <NoiseSlider compact />
            <button className="btn magenta big" style={{ marginTop: 10, width: '100%' }} onClick={askQuantum} disabled={busy || !!qa}>
              {busy ? 'Querying…' : 'Ask the quantum computer (1 query)'}
            </button>
          </div>
          <AnimatePresence>
            {qa && (
              <motion.div className="panel" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <h3>Bob's screen</h3>
                <div className="row" style={{ alignItems: 'center', gap: 16 }}>
                  <FidelityGauge value={qa.teleport_fidelity} size={120} label="teleport F" />
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '0.18em', color: qa.bob_verdict === 'constant' ? 'var(--cyan)' : 'var(--magenta)' }}>{qa.bob_verdict.toUpperCase()}</div>
                    <div className={qa.correct ? 'green' : 'red'} style={{ fontSize: 15 }}>{qa.correct ? '✓ correct' : '✗ wrong (noise)'}: truth is {qa.truth}</div>
                    <div className="mono dim" style={{ fontSize: 11, marginTop: 4 }}>measured |{qa.measured}⟩ · quantum queries: 1 · your classical queries: {qa.classical_queries_used}</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
