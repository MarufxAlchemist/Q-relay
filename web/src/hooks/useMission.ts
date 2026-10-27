import { useCallback, useEffect, useRef } from 'react'
import { useStore, type MissionEvent } from '../store/useStore'
import { api, wsUrl, type TeleportResult, type Vec3 } from '../lib/api'

const Z: Vec3 = [0, 0, 1]
let socket: WebSocket | null = null

function handle(ev: MissionEvent) {
  const s = useStore.getState()
  if (ev.type === 'noise_ack') return
  s.pushEvent(ev)
  const d = ev.data
  if (ev.type === 'state_drawn') s.setLive({ bloch: [d.bloch, Z, Z], ghost: d.bloch, fidelity: null })
  if (d.bloch && ev.stage === 'teleport' && Array.isArray(d.bloch[0])) s.setLive({ bloch: d.bloch })
  if (ev.type === 'fidelity') s.setLive({ fidelity: d.exact })
  if (ev.type === 'mission_summary') s.setMissionRunning(false)
}

function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (socket && socket.readyState === WebSocket.OPEN) return resolve(socket)
    const ws = new WebSocket(wsUrl('/ws/mission'))
    ws.onopen = () => { socket = ws; resolve(ws) }
    ws.onerror = () => reject(new Error('websocket failed'))
    ws.onclose = () => { socket = null; useStore.getState().setMissionRunning(false) }
    ws.onmessage = (m) => handle(JSON.parse(m.data))
  })
}

/** Drives the mission over the WebSocket; forwards slider changes mid-run. */
export function useMission() {
  const noise = useStore((s) => s.noise)
  const running = useStore((s) => s.missionRunning)

  const start = useCallback(async (opts: { n?: number | null; speed?: number } = {}) => {
    const s = useStore.getState()
    s.resetMission()
    s.setMissionRunning(true)
    try {
      const ws = await connect()
      ws.send(JSON.stringify({ action: 'start', noise: s.noise, n: opts.n ?? null, speed: opts.speed ?? 1 }))
    } catch {
      s.setMissionRunning(false)
    }
  }, [])

  useEffect(() => {
    if (running && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: 'noise', value: noise }))
  }, [noise, running])

  return { start, running }
}

/**
 * After a mission completes, dragging the noise slider re-runs the teleportation of the same state on the
 * server (debounced) so the fidelity gauge and Bob's arrow respond live.
 */
export function useLiveRerun() {
  const noise = useStore((s) => s.noise)
  const running = useStore((s) => s.missionRunning)
  const events = useStore((s) => s.events)
  const timer = useRef<number | undefined>(undefined)
  const drawn = events.find((e) => e.type === 'state_drawn')
  const done = events.some((e) => e.type === 'mission_summary')
  useEffect(() => {
    if (running || !drawn || !done) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.post<TeleportResult>('/api/teleport/run', { theta: drawn.data.theta, phi: drawn.data.phi, noise: { level: noise }, shots: 512 })
        const last = r.steps[r.steps.length - 1]
        useStore.getState().setLive({ bloch: last.bloch as [Vec3, Vec3, Vec3], fidelity: r.exact.fidelity })
      } catch { /* backend offline overlay handles it */ }
    }, 220)
    return () => window.clearTimeout(timer.current)
  }, [noise, running, drawn, done])
}
