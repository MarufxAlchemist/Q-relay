import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`

// Two phase-locked helical strands. uCoherence in [0,1]: lower values add jitter, flicker and broken strands,
// and shift colour cyan -> magenta -> red.
const frag = /* glsl */ `
  uniform float uTime; uniform float uCoherence; uniform float uActive;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float u = vUv.x; float y = vUv.y * 2.0 - 1.0;
    float inc = 1.0 - uCoherence;
    float env = smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.94, u);
    float jitter = inc * 0.55 * (noise(vec2(u * 30.0, uTime * 6.0)) - 0.5);
    float ph = u * 26.0 - uTime * 3.2;
    float s1 = 0.42 * sin(ph) + jitter;
    float s2 = -0.42 * sin(ph) - jitter;
    float w = 0.05 + 0.04 * inc;
    float g = exp(-pow((y - s1) / w, 2.0)) + exp(-pow((y - s2) / w, 2.0));
    g += 0.35 * exp(-pow(y / 0.5, 2.0)) * (0.5 + 0.5 * sin(ph * 0.5));   // soft core
    float breaks = smoothstep(inc * 1.1 - 0.05, inc * 1.1 + 0.05, noise(vec2(u * 9.0, uTime * 1.5)));
    float flicker = mix(1.0, step(0.25, hash(vec2(floor(uTime * 18.0), 1.0))), inc * 0.8);
    vec3 cyan = vec3(0.13, 0.89, 1.0); vec3 mag = vec3(1.0, 0.24, 0.65); vec3 red = vec3(1.0, 0.3, 0.37);
    vec3 col = inc < 0.5 ? mix(cyan, mag, inc * 2.0) : mix(mag, red, (inc - 0.5) * 2.0);
    float a = g * env * breaks * flicker * uActive;
    gl_FragColor = vec4(col * a * 1.6, a);
  }`

export function EntanglementBeam({ from, to, coherence, active }: {
  from: [number, number, number]; to: [number, number, number]; coherence: number; active: number
}) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCoherence: { value: 1 }, uActive: { value: 0 } },
  }), [])
  const target = useRef({ coherence, active })
  target.current = { coherence, active }
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt
    const k = 1 - Math.exp(-dt * 4)
    mat.uniforms.uCoherence.value += (target.current.coherence - mat.uniforms.uCoherence.value) * k
    mat.uniforms.uActive.value += (target.current.active - mat.uniforms.uActive.value) * k
  })
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  const length = a.distanceTo(b)
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  return (
    <mesh position={mid} rotation={[0, 0, angle]} material={mat}>
      <planeGeometry args={[length, 0.9, 1, 1]} />
    </mesh>
  )
}

/** Two classical-bit packets travelling along a straight wire; colour = bit value (cyan 0, magenta 1). */
export function ClassicalWire({ from, to, bits, startedAt }: {
  from: [number, number, number]; to: [number, number, number]; bits: [number, number] | null; startedAt: number | null
}) {
  const refs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)]
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
  useFrame(() => {
    refs.forEach((r, i) => {
      if (!r.current) return
      if (!bits || startedAt == null) { r.current.visible = false; return }
      const t = Math.min(1, Math.max(0, (performance.now() - startedAt) / 1400 - i * 0.12))
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      r.current.visible = t > 0 && t < 1
      r.current.position.lerpVectors(a, b, e)
      r.current.rotation.x += 0.05; r.current.rotation.y += 0.04
    })
  })
  return (
    <group>
      <mesh position={a.clone().add(b).multiplyScalar(0.5)} rotation={[0, 0, Math.atan2(b.y - a.y, b.x - a.x)]}>
        <boxGeometry args={[a.distanceTo(b), 0.008, 0.008]} />
        <meshBasicMaterial color="#56627a" />
      </mesh>
      {refs.map((r, i) => (
        <mesh key={i} ref={r} visible={false}>
          <boxGeometry args={[0.13, 0.13, 0.13]} />
          <meshStandardMaterial color={bits?.[i] ? '#FF3DA5' : '#22E4FF'} emissive={bits?.[i] ? '#FF3DA5' : '#22E4FF'}
            emissiveIntensity={3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
