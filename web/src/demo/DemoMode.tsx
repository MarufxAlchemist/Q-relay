import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, type Screen } from '../store/useStore'

interface Cue { at: number; screen?: Screen; fire?: string; noise?: [number, number, number]; caption: string }

/** The 90-second guided tour (docs/DEMO_SCRIPT.md). `noise` = [from, to, seconds] ramps the slider. */
const SCRIPT: Cue[] = [
  { at: 0, screen: 'mission', noise: [0, 0, 0], caption: 'Q-Relay: three quantum protocols wired into one mission.', fire: 'mission.start' },
  { at: 5, caption: 'Stage 1: a QRNG fills an entropy pool. It seeds a secret state and a hidden oracle.' },
  { at: 12, caption: 'Stage 2: Alice and Bob share a Bell pair. Each half alone looks maximally mixed: the arrows shrink.' },
  { at: 20, caption: 'Alice measures and sends two classical bits. Bob corrects, and his arrow snaps onto the ghost of |ψ⟩.' },
  { at: 30, caption: 'Stage 3: Bob uses a teleported |−⟩ as the Deutsch–Jozsa ancilla. One query decides constant vs balanced.' },
  { at: 40, noise: [0, 0.85, 8], caption: 'Now we turn up the noise. Watch the beam decohere and the fidelity fall below the classical limit of 2/3.' },
  { at: 50, screen: 'qrng', fire: 'qrng.break', noise: [0.85, 0, 0], caption: 'QRNG Lab: the same statistical suite passes quantum bits, and catches a broken PRNG (RANDU) red-handed.' },
  { at: 62, screen: 'dj', fire: 'dj.race', caption: 'DJ Lab: amplitudes interfere onto |0…0⟩ or cancel there. Quantum: 1 query. Classical worst case: 2^(n−1)+1.' },
  { at: 76, screen: 'hardware', caption: 'Hardware page: simulator, emulated device and IBM hardware side by side, each clearly labelled.' },
  { at: 88, caption: 'Q-Relay: correct, tested, honest, and it runs offline. Thank you!' },
]
const END = 94

export function DemoMode() {
  const demo = useStore((s) => s.demo)
  const caption = useStore((s) => s.caption)
  useEffect(() => {
    const s = useStore.getState()
    if (!demo) { s.setCaption(null); return }
    const timers: number[] = []
    let ramp = 0
    SCRIPT.forEach((c) => {
      timers.push(window.setTimeout(() => {
        const st = useStore.getState()
        if (c.screen) st.setScreen(c.screen)
        if (c.fire) st.fire(c.fire)
        st.setCaption(c.caption)
        if (c.noise) {
          const [a, b, sec] = c.noise
          cancelAnimationFrame(ramp)
          if (sec === 0) st.setNoise(b)
          else {
            const t0 = performance.now()
            const step = () => {
              const t = Math.min(1, (performance.now() - t0) / (sec * 1000))
              useStore.getState().setNoise(a + (b - a) * t)
              if (t < 1) ramp = requestAnimationFrame(step)
            }
            ramp = requestAnimationFrame(step)
          }
        }
      }, c.at * 1000))
    })
    timers.push(window.setTimeout(() => useStore.getState().setDemo(false), END * 1000))
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(ramp); useStore.getState().setCaption(null) }
  }, [demo])

  const screen = useStore((s) => s.screen)
  return (
    <AnimatePresence>
      {demo && caption && screen !== 'mission' && (
        <motion.div key={caption} className="caption-bar" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          style={{ position: 'fixed', zIndex: 60 }}>
          {caption}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
