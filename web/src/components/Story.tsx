import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { audio } from '../lib/audio'

export interface Chapter {
  key: string
  title: string
  /** plain-language narration shown on the left */
  text: ReactNode
  /** optional "try this" hint */
  tip?: ReactNode
  /** seconds before auto-play moves on */
  seconds?: number
  /** the visuals for this chapter; they mount fresh each time, so their build-up animations replay */
  render: () => ReactNode
}

/**
 * A chaptered explainer: narration rail on the left, one chapter's visuals on the right.
 * Next/Back, click a chapter, ←/→ keys, or Play to auto-advance. `playTick` (e.g. from demo mode) restarts auto-play.
 */
export function Story({ chapters, controls, playTick = 0, kicker }: {
  chapters: Chapter[]; controls?: ReactNode; playTick?: number; kicker: string
}) {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const start = useRef(performance.now())
  const ch = chapters[Math.min(i, chapters.length - 1)]
  const dur = (ch.seconds ?? 10) * 1000

  const go = (k: number) => {
    const n = Math.max(0, Math.min(chapters.length - 1, k))
    if (n !== i) audio.sfx('tick')
    setI(n)
    start.current = performance.now()
    setProgress(0)
  }

  useEffect(() => { if (playTick) { setI(0); setPlaying(true); start.current = performance.now() } }, [playTick])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const p = (performance.now() - start.current) / dur
      if (p >= 1) {
        if (i < chapters.length - 1) go(i + 1)
        else { setPlaying(false); setProgress(1) }
        return
      }
      setProgress(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, i, dur]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  return (
    <div className="story">
      <section className="panel flex story-rail">
        <div className="story-kicker">{kicker}</div>
        <div className="story-chapters">
          {chapters.map((c, k) => (
            <button key={c.key} className={`story-ch ${k === i ? 'on' : k < i ? 'done' : ''}`} onClick={() => go(k)}>
              <span className="n">{k + 1}</span><span>{c.title}</span>
            </button>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            <motion.div key={ch.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="story-title">{ch.title}</h2>
              <p className="story-text">{ch.text}</p>
              {ch.tip && <p className="story-tip">▶ {ch.tip}</p>}
            </motion.div>
          </AnimatePresence>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {controls}
          <div className="story-progress"><div style={{ width: `${(playing ? progress : 0) * 100}%` }} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn" disabled={i === 0} onClick={() => go(i - 1)}>← Back</button>
            <button className={`btn ${playing ? '' : 'magenta'}`} onClick={() => { setPlaying(!playing); start.current = performance.now() }}>
              {playing ? '❚❚ Pause' : '▶ Play story'}
            </button>
            <button className="btn magenta" disabled={i === chapters.length - 1} onClick={() => go(i + 1)}>Next →</button>
          </div>
        </div>
      </section>
      <AnimatePresence mode="wait">
        <motion.div key={ch.key} className="story-stage" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.35 }}>
          {ch.render() ?? <div className="panel" style={{ flex: 1, display: 'grid', placeItems: 'center' }}><span className="mono muted">loading data…</span></div>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** A number that counts up from 0 when it mounts. */
export function CountUp({ to, seconds = 1.8, decimals = 0, suffix = '' }: { to: number; seconds?: number; decimals?: number; suffix?: string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / (seconds * 1000))
      setV(to * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, seconds])
  return <>{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</>
}

/** A lab screen with a slim header: title on the left, Story / Overview switch on the right. */
export function LabShell({ title, subtitle, story, overview }: { title: string; subtitle: string; story: () => ReactNode; overview: () => ReactNode }) {
  const [view, setView] = useState<'story' | 'overview'>('story')
  return (
    <div className="screen" style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', padding: '0 4px' }}>
        <div className="row" style={{ gap: 12 }}>
          <span style={{ fontWeight: 700, letterSpacing: '0.16em', fontSize: 14 }}>{title}</span>
          <span className="muted" style={{ fontSize: 13 }}>{subtitle}</span>
        </div>
        <div className="seg">
          <button className={view === 'story' ? 'on' : ''} onClick={() => setView('story')}>STORY</button>
          <button className={view === 'overview' ? 'on' : ''} onClick={() => setView('overview')}>OVERVIEW (all panels)</button>
        </div>
      </div>
      <div style={{ minHeight: 0 }}>{view === 'story' ? story() : overview()}</div>
    </div>
  )
}
