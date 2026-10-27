import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { motion } from 'framer-motion'
import * as THREE from 'three'
import { BlochSphere } from '../scenes/BlochSphere'
import { EntanglementBeam } from '../scenes/Beam'
import { Effects } from '../scenes/MissionScene'
import { useStore, save } from '../store/useStore'
import { audio } from '../lib/audio'
import type { Vec3 } from '../lib/api'

function Stars() {
  const ref = useRef<THREE.Points>(null)
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(1800 * 3)
    for (let i = 0; i < p.length; i += 3) {
      p[i] = (Math.random() - 0.5) * 40; p[i + 1] = (Math.random() - 0.5) * 22; p[i + 2] = -Math.random() * 25 - 3
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    return g
  }, [])
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 0.01 })
  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial size={0.06} color="#9fb6ff" transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}

/** Two Bloch spheres whose arrows slowly precess (the hero art). */
function Spinners() {
  const [v, setV] = useState<[Vec3, Vec3]>([[1, 0, 0], [1, 0, 0]])
  const acc = useRef({ t: 0, last: 0 })
  useFrame((_, dt) => {
    acc.current.t += dt
    if (acc.current.t - acc.current.last < 0.08) return
    acc.current.last = acc.current.t
    const t = acc.current.t
    const th = 1.0 + 0.5 * Math.sin(t * 0.4)
    setV([[Math.sin(th) * Math.cos(t * 0.7), Math.sin(th) * Math.sin(t * 0.7), Math.cos(th)],
      [Math.sin(th) * Math.cos(t * 0.7 + 0.15), Math.sin(th) * Math.sin(t * 0.7 + 0.15), Math.cos(th)]])
  })
  return (
    <>
      <BlochSphere vector={v[0]} color="#22E4FF" position={[-3.4, -0.75, 0]} scale={1.15} label="ALICE" />
      <BlochSphere vector={v[1]} color="#FF3DA5" position={[3.4, -0.75, 0]} scale={1.15} label="BOB" />
      <EntanglementBeam from={[-2.2, -0.75, 0]} to={[2.2, -0.75, 0]} coherence={0.95} active={1} />
    </>
  )
}

function Emblem() {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
      <svg width="150" height="150" viewBox="-80 -80 160 160">
        <defs>
          <radialGradient id="eg"><stop offset="0" stopColor="#22E4FF" stopOpacity="0.18" /><stop offset="1" stopColor="#22E4FF" stopOpacity="0" /></radialGradient>
        </defs>
        <circle r="66" fill="url(#eg)" stroke="#2b5d6e" strokeWidth="2" />
        <ellipse rx="66" ry="20" fill="none" stroke="#2b5d6e" strokeWidth="1.5" />
        <ellipse rx="20" ry="66" fill="none" stroke="#2b5d6e" strokeWidth="1.2">
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="18s" repeatCount="indefinite" />
        </ellipse>
        <line x1="0" y1="-74" x2="0" y2="74" stroke="#2b5d6e" strokeWidth="1" />
        <g>
          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="7s" repeatCount="indefinite" />
          <line x1="0" y1="0" x2="34" y2="-40" stroke="#FFB020" strokeWidth="4" strokeLinecap="round" />
          <circle cx="34" cy="-40" r="6" fill="#FFE2A0" />
        </g>
        <circle r="4" fill="#FFB020" />
      </svg>
      <div className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', color: '#6f8fa0' }}>QISKIT FALL FEST 2026 · DBATU</div>
    </div>
  )
}

function TBtn({ children, onClick, tone = 'cyan', disabled }: { children: React.ReactNode; onClick: () => void; tone?: 'amber' | 'cyan'; disabled?: boolean }) {
  return (
    <motion.button className={`tbtn ${tone}`} disabled={disabled} whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }}
      onMouseEnter={() => audio.sfx('tick')} onClick={() => { audio.sfx('click'); onClick() }}>
      {children}
    </motion.button>
  )
}

export function TitleScreen() {
  const s = useStore()
  const low = s.lowPower
  const seenGuide = (() => { try { return localStorage.getItem('qrelay.guideSeen') === '1' } catch { return true } })()
  const canContinue = (() => { try { return !!localStorage.getItem('qrelay.screen') } catch { return false } })()

  const enterMusic = () => { if (useStore.getState().music) audio.start() }
  const go = (screen?: 'mission') => {
    enterMusic()
    if (screen) s.setScreen(screen)
    s.setTitle(false)
  }

  return (
    <motion.div className="title-root" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
      <div className="title-frame">
        <i className="rivet tl" /><i className="rivet tr" /><i className="rivet bl" /><i className="rivet br" />
        <Canvas dpr={low ? 1 : [1, 2]} camera={{ position: [0, 0.2, 9], fov: 40 }}>
          <color attach="background" args={['#04060c']} />
          <ambientLight intensity={0.5} />
          <Stars />
          <Spinners />
          <Effects />
        </Canvas>
        <div className="title-plate">
          <i className="rivet l" /><i className="rivet r" />
          <div className="title-text">Q-RELAY</div>
        </div>
        <div className="title-sub">QUANTUM NETWORK · MISSION CONTROL</div>
        <div className="title-tag">random numbers → teleportation → one-query puzzle</div>
      </div>

      <div className="title-menu">
        <TBtn tone="amber" onClick={() => go()} disabled={!canContinue}>CONTINUE <span style={{ float: 'right' }}>➔</span></TBtn>
        <TBtn onClick={() => { go('mission'); if (!seenGuide) s.setGuide(true) }}>NEW MISSION</TBtn>
        <TBtn tone="amber" onClick={() => {
          const on = !s.music
          s.setMusic(on)
          if (on) audio.start(); else audio.stop()
        }}>{s.music ? 'MUSIC ON ♫' : 'MUSIC OFF'}</TBtn>
        <TBtn onClick={() => { enterMusic(); s.setGuide(true) }}>MISSION GUIDE</TBtn>
        <div style={{ marginTop: 24 }}><Emblem /></div>
        <div className="dim mono" style={{ fontSize: 10.5, textAlign: 'center', marginTop: 8 }}>
          D demo · H help · G guide · M music · Esc menu
        </div>
      </div>
    </motion.div>
  )
}

export const markGuideSeen = () => save('qrelay.guideSeen', '1')
