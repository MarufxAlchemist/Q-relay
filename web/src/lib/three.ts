import * as THREE from 'three'
import type { Vec3 } from './api'

/** Qiskit Bloch (x, y, z) with |0> at +z  ->  three.js Y-up: (x, z, -y). Preserves handedness. */
export function toThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[2], -v[1])
}

/** Inverse of toThree. */
export function fromThree(p: THREE.Vector3): Vec3 {
  return [p.x, -p.z, p.y]
}

export function anglesToBloch(theta: number, phi: number): Vec3 {
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)]
}

export function blochToAngles(v: Vec3): { theta: number; phi: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1
  const theta = Math.acos(Math.max(-1, Math.min(1, v[2] / r)))
  let phi = Math.atan2(v[1], v[0])
  if (phi < 0) phi += 2 * Math.PI
  return { theta, phi }
}

export const len3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

export function angleBetween(a: Vec3, b: Vec3): number {
  const la = len3(a), lb = len3(b)
  if (la < 1e-6 || lb < 1e-6) return NaN
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

export const COLORS = {
  cyan: new THREE.Color('#22E4FF'),
  magenta: new THREE.Color('#FF3DA5'),
  violet: new THREE.Color('#8B5CF6'),
  amber: new THREE.Color('#FFB020'),
  green: new THREE.Color('#2EE59D'),
  red: new THREE.Color('#FF4D5E'),
}
