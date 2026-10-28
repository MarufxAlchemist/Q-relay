import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { BlochSphere } from './BlochSphere'
import { ClassicalWire, EntanglementBeam } from './Beam'
import { useStore } from '../store/useStore'
import { Stars } from './Stars'
import type { Vec3 } from '../lib/api'

export function Effects() {
  const low = useStore((s) => s.lowPower)
  if (low) return null
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.25} luminanceSmoothing={0.3} />
      <Vignette eskil={false} offset={0.25} darkness={0.75} />
    </EffectComposer>
  )
}

export function MissionScene({ beamActive, classicalBits, classicalAt }: {
  beamActive: number; classicalBits: [number, number] | null; classicalAt: number | null
}) {
  const bloch = useStore((s) => s.bloch)
  const ghost = useStore((s) => s.ghost)
  const noise = useStore((s) => s.noise)
  const low = useStore((s) => s.lowPower)
  const b: Vec3[] = bloch
  return (
    <Canvas dpr={low ? 1 : [1, 2]} camera={{ position: [0, 0.6, 9.2], fov: 38 }} gl={{ antialias: !low, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#030806']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 4, 6]} intensity={30} color="#8F7CFF" />
      <Stars />
      <Suspense fallback={null}>
        <BlochSphere vector={b[0]} color="#4DFFA6" position={[-4.1, 0.25, 0]} scale={1.15} label="ALICE · q0 |ψ⟩" />
        <BlochSphere vector={b[1]} color="#8F7CFF" position={[-1.75, 0.25, 0]} scale={0.62} showLabels={false} label="q1" trail={false} dim />
        <BlochSphere vector={b[2]} color="#F5C84B" position={[4.1, 0.25, 0]} scale={1.15} ghost={ghost} label="BOB · q2" />
        <EntanglementBeam from={[-1.05, 0.25, 0]} to={[2.85, 0.25, 0]} coherence={1 - noise} active={beamActive} />
        <ClassicalWire from={[-4.1, -2.45, 0]} to={[4.1, -2.45, 0]} bits={classicalBits} startedAt={classicalAt} />
      </Suspense>
      <Effects />
    </Canvas>
  )
}
