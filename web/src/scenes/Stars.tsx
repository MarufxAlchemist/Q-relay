import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** A slowly rotating field of stars behind a 3-D scene. */
export function Stars({ count = 1600, spread = 40 }: { count?: number; spread?: number }) {
  const ref = useRef<THREE.Points>(null)
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const tints = [[1, 1, 1], [0.75, 1, 0.85], [1, 0.9, 0.65], [0.75, 0.8, 1]]
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * spread
      p[i * 3 + 1] = (Math.random() - 0.5) * spread * 0.55
      p[i * 3 + 2] = -Math.random() * 25 - 3
      const t = tints[Math.floor(Math.random() * tints.length)]
      col.set(t, i * 3)
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    return g
  }, [count, spread])
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 0.008 })
  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.85} sizeAttenuation />
    </points>
  )
}
