// Thin typed client for the Q-Relay FastAPI backend (proxied at /api in dev, same origin in production).

export type Vec3 = [number, number, number]
export type Source = 'SIM' | 'EMU' | 'HW' | 'PRNG'

export interface NoiseIn { level?: number; p1?: number; p2?: number; readout?: number; t1_us?: number; t2_us?: number }

export interface TestResult { name: string; p_value: number | null; passed: boolean | null; statistic: number; detail: string }
export interface Suite {
  n_bits: number; tests: TestResult[]; passed: number; total: number
  entropy: { p1: number; shannon_per_bit: number; min_entropy_per_bit: number; shannon_per_byte: number; min_entropy_per_byte: number }
}
export interface Walk { x: number[]; walk: number[]; envelope: number[] }
export interface CircuitOp { name: string; qubits: number[]; params: number[]; condition: { register: string; value: number } | null }
export interface CircuitJson { num_qubits: number; ops: CircuitOp[] }

export interface QrngResult {
  source: Source; source_label: string; backend: string; n_raw: number; n_bits: number; yield: number; mitigate: string
  counts: [number, number]; suite: Suite; fingerprint: string; walk: Walk; autocorr: number[]; preview: number[]
  circuit: CircuitJson
}
export interface CompareEntry {
  source: Source; suite: Suite; fingerprint: string; walk: Walk; autocorr: number[]; counts: [number, number]; preview: number[]
}

export interface Step {
  name: string; caption: string; gate: string; bloch: Vec3[]; fidelity_bob: number; purity: number[]
  outcome: { m0: number; m1: number; probabilities?: number[] } | null
}
export interface TeleportResult {
  theta: number; phi: number; r_in: Vec3; steps: Step[]
  exact: { fidelity: number; branches: Record<string, { fidelity: number; probability: number }> }
  tomography: { r_in: Vec3; r_out: Vec3; fidelity: number; fidelity_mitigated?: number; r_mitigated?: Vec3; shots: number }
  classical_bound: number; circuit: CircuitJson; source: Source
}

export interface OracleInfo { name: string; kind: 'constant' | 'balanced'; n: number; truth_table: number[]; params: Record<string, unknown>; cx?: number }
export interface DJStep { stage: string; caption: string; re: number[]; im: number[]; ancilla_bloch: Vec3 }
export interface DJResult {
  verdict: string; p_all_zeros: number; counts: Record<string, number>; correct: boolean; truth: string
  success_probability: number; oracle: OracleInfo; n: number; steps: DJStep[]; p_all_zeros_exact: number
  queries: { quantum: number; classical_worst: number }; circuit: CircuitJson
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!r.ok) {
    let msg = `${r.status}`
    try { msg = (await r.json()).detail ?? msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return r.json() as Promise<T>
}

export const api = {
  get: <T,>(path: string) => req<T>(path),
  post: <T,>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) }),
}

export function unpackBits(b64: string, n?: number): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length * 8)
  for (let i = 0; i < bin.length; i++) {
    const v = bin.charCodeAt(i)
    for (let k = 0; k < 8; k++) out[i * 8 + k] = (v >> (7 - k)) & 1
  }
  return n ? out.subarray(0, n) : out
}

export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}${path}`
}
