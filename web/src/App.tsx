import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, type Screen } from './store/useStore'
import { api, type QrngResult } from './lib/api'
import { FidelityGauge } from './components/controls'
import { MissionControl } from './screens/MissionControl'
import { QrngLab } from './screens/QrngLab'
import { TeleportLab } from './screens/TeleportLab'
import { DjLab } from './screens/DjLab'
import { Game } from './screens/Game'
import { Hardware } from './screens/Hardware'
import { Report } from './screens/Report'
import { DemoMode } from './demo/DemoMode'

const NAV: { key: Screen; label: string; hotkey: string }[] = [
  { key: 'mission', label: 'Mission', hotkey: '1' },
  { key: 'qrng', label: 'QRNG Lab', hotkey: '2' },
  { key: 'teleport', label: 'Teleport Lab', hotkey: '3' },
  { key: 'dj', label: 'DJ Lab', hotkey: '4' },
  { key: 'game', label: 'Beat the Oracle', hotkey: '5' },
  { key: 'hardware', label: 'Hardware', hotkey: '6' },
  { key: 'report', label: 'Report', hotkey: '7' },
]

function Clock() {
  const start = useStore((s) => s.missionStart)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  const t = start ? Math.max(0, (now - start) / 1000) : 0
  return <b>T+{String(Math.floor(t / 60)).padStart(2, '0')}:{(t % 60).toFixed(1).padStart(4, '0')}</b>
}

function Hud() {
  const screen = useStore((s) => s.screen)
  const setScreen = useStore((s) => s.setScreen)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const noise = useStore((s) => s.noise)
  const fidelity = useStore((s) => s.fidelity)
  const low = useStore((s) => s.lowPower)
  const toggleLow = useStore((s) => s.toggleLowPower)
  const demo = useStore((s) => s.demo)
  return (
    <header className="hud">
      <div className="brand">Q-RELAY <span>//</span></div>
      <nav>
        {NAV.map((n) => (
          <button key={n.key} className={screen === n.key ? 'active' : ''} onClick={() => setScreen(n.key)} title={`hotkey ${n.hotkey}`}>{n.label}</button>
        ))}
      </nav>
      <div className="spacer" />
      <div className="tele">
        <button className={`badge ${mode}`} style={{ background: 'none', cursor: 'pointer' }} title="QRNG source mode (click to cycle)"
          onClick={() => setMode(mode === 'SIM' ? 'EMU' : mode === 'EMU' ? 'HW' : 'SIM')}>{mode}</button>
        <span>NOISE <b style={{ color: noise > 0.6 ? 'var(--red)' : noise > 0.3 ? 'var(--amber)' : 'var(--cyan)' }}>{(noise * 100).toFixed(0)}%</b></span>
        <span>MISSION <Clock /></span>
        <FidelityGauge value={fidelity} size={44} label="" />
        <button className="badge" style={{ background: 'none', cursor: 'pointer', color: low ? 'var(--amber)' : 'var(--dim)' }} onClick={toggleLow} title="low-power mode (L)">
          {low ? 'LOW-PWR' : 'FX ON'}
        </button>
        {demo && <span className="badge" style={{ color: 'var(--magenta)' }}>DEMO</span>}
      </div>
    </header>
  )
}

function Boot() {
  const setBooted = useStore((s) => s.setBooted)
  const [bits, setBits] = useState<number[]>([])
  const [lines, setLines] = useState<string[]>([])
  useEffect(() => {
    const script = [
      'Q-RELAY // DBATU // QISKIT FALL FEST 2026',
      'init  qiskit 2.6 · aer 0.18 · runtime 0.51',
      'link  alice ⇄ bob: quantum channel + classical wire',
      'chk   classical teleportation bound F = 2/3',
      'pool  charging entropy pool from |+⟩ measurements…',
    ]
    script.forEach((l, i) => setTimeout(() => setLines((x) => [...x, l]), 350 * i))
    api.post<QrngResult>('/api/qrng/generate', { n_bits: 4096, mode: 'sim' }).then((r) => setBits(r.preview)).catch(() => setBits([]))
    const done = setTimeout(() => setBooted(true), 4200)
    const skip = () => setBooted(true)
    window.addEventListener('keydown', skip)
    return () => { clearTimeout(done); window.removeEventListener('keydown', skip) }
  }, [setBooted])
  return (
    <motion.div className="overlay" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }} onClick={() => setBooted(true)} style={{ cursor: 'pointer' }}>
      <div style={{ width: 720 }}>
        <div className="mono" style={{ fontSize: 14, lineHeight: 1.9 }}>
          {lines.map((l, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} style={{ color: i === 0 ? 'var(--magenta)' : 'var(--text)' }}>
              <span className="dim">{'>'} </span>{l}
            </motion.div>
          ))}
        </div>
        <div style={{ marginTop: 18, height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 3.8, ease: 'easeInOut' }}
            style={{ height: '100%', background: 'linear-gradient(90deg, var(--cyan), var(--magenta))', boxShadow: '0 0 12px var(--cyan)' }} />
        </div>
        <div className="mono" style={{ marginTop: 12, fontSize: 11, wordBreak: 'break-all', lineHeight: 1.3, height: 58, overflow: 'hidden' }}>
          {bits.slice(0, 600).map((b, i) => <span key={i} style={{ color: b ? 'var(--magenta)' : 'var(--cyan)', opacity: 0.85 }}>{b}</span>)}
        </div>
        <div className="dim mono" style={{ marginTop: 14, fontSize: 11 }}>press any key to skip · D = demo · P = presenter · L = low power</div>
      </div>
    </motion.div>
  )
}

function Offline() {
  return (
    <div className="overlay">
      <div className="panel" style={{ width: 560 }}>
        <h3 className="red">Backend offline</h3>
        <p>The Q-Relay API is not reachable. Start it from the repo root:</p>
        <pre className="mono cyan" style={{ background: 'var(--bg-2)', padding: 12, borderRadius: 4 }}>
{`.\\tasks.ps1 dev        # Windows
make dev                # macOS / Linux
# or: .venv\\Scripts\\python -m uvicorn server.main:app --port 8000`}
        </pre>
        <p className="tip">This page retries automatically every 2 seconds.</p>
      </div>
    </div>
  )
}

export default function App() {
  const screen = useStore((s) => s.screen)
  const booted = useStore((s) => s.booted)
  const backendOk = useStore((s) => s.backendOk)
  const scan = useStore((s) => s.scanlines)
  const presenter = useStore((s) => s.presenter)

  useEffect(() => {
    let alive = true
    const ping = async () => {
      try { await api.get('/api/health'); if (alive) useStore.getState().setBackendOk(true) }
      catch { if (alive) useStore.getState().setBackendOk(false) }
    }
    ping()
    const id = setInterval(ping, 2000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return
      const s = useStore.getState()
      if (!s.booted) return
      const nav = NAV.find((n) => n.hotkey === e.key)
      if (nav) s.setScreen(nav.key)
      if (e.key === 'd' || e.key === 'D') s.setDemo(!s.demo)
      if (e.key === 'p' || e.key === 'P') s.togglePresenter()
      if (e.key === 'l' || e.key === 'L') s.toggleLowPower()
      if (e.key === 's' || e.key === 'S') s.toggleScanlines()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={`app ${scan ? 'scanlines' : ''} ${presenter ? 'presenter' : ''}`}>
      <Hud />
      <main style={{ minHeight: 0, position: 'relative' }}>
        {screen === 'mission' && <MissionControl />}
        {screen === 'qrng' && <QrngLab />}
        {screen === 'teleport' && <TeleportLab />}
        {screen === 'dj' && <DjLab />}
        {screen === 'game' && <Game />}
        {screen === 'hardware' && <Hardware />}
        {screen === 'report' && <Report />}
      </main>
      <DemoMode />
      <AnimatePresence>{!booted && <Boot />}</AnimatePresence>
      {booted && backendOk === false && <Offline />}
    </div>
  )
}
