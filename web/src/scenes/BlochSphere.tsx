import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Vec3 } from '../lib/api'
import { toThree } from '../lib/three'

const UP = new THREE.Vector3(0, 1, 0)
const labelCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>()

/** Text rendered once to a canvas texture and shown as a sprite (no DOM overlays inside the WebGL scene). */
function TextSprite({ text, position, height = 0.17, color = 'rgba(201,211,230,0.75)', font = 'JetBrains Mono' }: {
  text: string; position: [number, number, number]; height?: number; color?: string; font?: string
}) {
  const key = `${text}|${color}|${font}`
  let entry = labelCache.get(key)
  if (!entry) {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const px = 64
    ctx.font = `${px}px ${font}, monospace`
    const w = Math.ceil(ctx.measureText(text).width) + 16
    c.width = w; c.height = px + 20
    ctx.font = `${px}px ${font}, monospace`
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 8, c.height / 2)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    entry = { tex, aspect: c.width / c.height }
    labelCache.set(key, entry)
  }
  return (
    <sprite position={position} scale={[height * entry.aspect, height, 1]}>
      <spriteMaterial map={entry.tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  )
}
const TRAIL = 60

const shellVertex = /* glsl */ `
  varying vec3 vN; varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`
const shellFragment = /* glsl */ `
  uniform vec3 uColor; uniform float uStrength;
  varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
    gl_FragColor = vec4(uColor * (0.25 + 1.6 * f) * uStrength, 0.05 + 0.55 * f);
  }`

function circle(axis: 'xy' | 'xz' | 'yz'): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2
    const c = Math.cos(a), s = Math.sin(a)
    pts.push(axis === 'xz' ? new THREE.Vector3(c, 0, s) : axis === 'xy' ? new THREE.Vector3(c, s, 0) : new THREE.Vector3(0, c, s))
  }
  return pts
}

interface Props {
  vector: Vec3
  color?: string
  ghost?: Vec3 | null
  label?: string
  position?: [number, number, number]
  scale?: number
  showLabels?: boolean
  trail?: boolean
  dim?: boolean
  onDrag?: (p: THREE.Vector3) => void
}

/**
 * Bloch sphere with an eased state arrow. Arrow length = |r|: a shrunken arrow is a mixed qubit (e.g. one half
 * of an entangled pair), which is the physically honest picture.
 */
export function BlochSphere({ vector, color = '#22E4FF', ghost, label, position = [0, 0, 0], scale = 1,
  showLabels = true, trail = true, dim = false, onDrag }: Props) {
  const arrow = useRef<THREE.Group>(null)
  const ghostRef = useRef<THREE.Group>(null)
  const tip = useRef<THREE.Mesh>(null)
  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  const trailState = useRef({ count: 0, last: new THREE.Vector3(9, 9, 9) })
  const cur = useRef({ dir: new THREE.Vector3(0, 1, 0), len: 1 })
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), target: new THREE.Vector3(), c: new THREE.Color(color) }), [color])
  const dragging = useRef(false)

  const shellMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: shellVertex, fragmentShader: shellFragment, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: dim ? 0.4 : 0.8 } },
  }), [color, dim])

  const rings = useMemo(() => [circle('xz'), circle('xy'), circle('yz')], [])

  useFrame((_, dt) => {
    const t = toThree(vector)
    const L = Math.min(1, t.length())
    tmp.target.copy(t.lengthSq() > 1e-8 ? t.normalize() : cur.current.dir)
    const k = 1 - Math.exp(-dt * 6) // ~600 ms ease
    cur.current.dir.lerp(tmp.target, k).normalize()
    cur.current.len += (L - cur.current.len) * k
    if (arrow.current) {
      tmp.q.setFromUnitVectors(UP, cur.current.dir)
      arrow.current.quaternion.copy(tmp.q)
      arrow.current.scale.set(1, Math.max(cur.current.len, 0.001), 1)
      arrow.current.visible = cur.current.len > 0.02
    }
    if (tip.current) tip.current.position.copy(cur.current.dir).multiplyScalar(cur.current.len)
    if (ghostRef.current && ghost) {
      const g = toThree(ghost).normalize()
      ghostRef.current.quaternion.setFromUnitVectors(UP, g)
    }
    if (trail) {
      const st = trailState.current
      const p = cur.current.dir.clone().multiplyScalar(cur.current.len)
      if (p.distanceTo(st.last) > 0.01) {
        const pos = trailGeom.attributes.position.array as Float32Array
        const col = trailGeom.attributes.color.array as Float32Array
        pos.copyWithin(3, 0, (TRAIL - 1) * 3)
        pos[0] = p.x; pos[1] = p.y; pos[2] = p.z
        st.count = Math.min(TRAIL, st.count + 1)
        for (let i = 0; i < st.count; i++) {
          const a = 1 - i / TRAIL
          col[i * 3] = tmp.c.r * a; col[i * 3 + 1] = tmp.c.g * a; col[i * 3 + 2] = tmp.c.b * a
        }
        trailGeom.attributes.position.needsUpdate = true
        trailGeom.attributes.color.needsUpdate = true
        trailGeom.setDrawRange(0, st.count)
        st.last.copy(p)
      }
    }
  })

  const drag = (e: ThreeEvent<PointerEvent>) => {
    if (!onDrag || !dragging.current) return
    e.stopPropagation()
    const local = e.object.worldToLocal(e.point.clone())
    onDrag(local.normalize())
  }

  return (
    <group position={position} scale={scale}>
      <mesh material={shellMat}
        onPointerDown={onDrag ? (e) => { dragging.current = true; (e.target as Element | null)?.setPointerCapture?.(e.pointerId); drag(e) } : undefined}
        onPointerMove={onDrag ? drag : undefined}
        onPointerUp={onDrag ? () => { dragging.current = false } : undefined}
        onPointerLeave={onDrag ? () => { dragging.current = false } : undefined}>
        <sphereGeometry args={[1, 48, 32]} />
      </mesh>
      {rings.map((pts, i) => (
        <Line key={i} points={pts} color={i === 0 ? color : '#3a4a66'} lineWidth={i === 0 ? 1.2 : 0.8} transparent opacity={i === 0 ? 0.55 : 0.4} />
      ))}
      <Line points={[[0, -1.15, 0], [0, 1.15, 0]]} color="#3a4a66" lineWidth={0.8} />
      <Line points={[[-1.15, 0, 0], [1.15, 0, 0]]} color="#2a3650" lineWidth={0.6} />
      <Line points={[[0, 0, -1.15], [0, 0, 1.15]]} color="#2a3650" lineWidth={0.6} />

      {/* state arrow: cylinder + cone, unit length along +Y, scaled by |r| */}
      <group ref={arrow}>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.84, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dim ? 1 : 2.4} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.92, 0]}>
          <coneGeometry args={[0.07, 0.16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={dim ? 1 : 2.8} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={tip}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      {ghost && (
        <group ref={ghostRef}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 1, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
          </mesh>
          <mesh position={[0, 1.0, 0]}>
            <sphereGeometry args={[0.04, 10, 10]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
          </mesh>
        </group>
      )}
      {trail && (
        <line>
          <primitive object={trailGeom} attach="geometry" />
          <lineBasicMaterial vertexColors transparent opacity={0.9} blending={THREE.AdditiveBlending} />
        </line>
      )}
      {showLabels && (
        <>
          <TextSprite text="|0⟩" position={[0, 1.3, 0]} />
          <TextSprite text="|1⟩" position={[0, -1.3, 0]} />
          <TextSprite text="|+⟩" position={[1.32, 0, 0]} />
          <TextSprite text="|−⟩" position={[-1.32, 0, 0]} />
          <TextSprite text="|+i⟩" position={[0, 0.08, -1.3]} height={0.13} color="rgba(201,211,230,0.4)" />
        </>
      )}
      {label && <TextSprite text={label} position={[0, -1.72, 0]} height={0.2} color="rgba(139,151,173,0.95)" font="Space Grotesk" />}
    </group>
  )
}
