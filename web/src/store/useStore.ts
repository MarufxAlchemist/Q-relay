import { create } from 'zustand'
import type { Source, Vec3 } from '../lib/api'

export type Screen = 'mission' | 'qrng' | 'teleport' | 'dj' | 'game' | 'hardware' | 'report'

export interface MissionEvent {
  type: string
  stage: 'qrng' | 'teleport' | 'dj' | 'summary'
  t: number
  caption: string
  data: Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
export const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }

interface State {
  title: boolean
  setTitle: (t: boolean) => void
  guide: boolean
  setGuide: (g: boolean) => void
  help: boolean
  setHelp: (h: boolean) => void
  music: boolean
  setMusic: (m: boolean) => void
  screen: Screen
  setScreen: (s: Screen) => void
  booted: boolean
  setBooted: (b: boolean) => void
  backendOk: boolean | null
  setBackendOk: (b: boolean) => void
  mode: Source
  setMode: (m: Source) => void
  noise: number
  setNoise: (v: number) => void
  lowPower: boolean
  toggleLowPower: () => void
  scanlines: boolean
  toggleScanlines: () => void
  presenter: boolean
  togglePresenter: () => void

  // mission
  events: MissionEvent[]
  missionRunning: boolean
  missionStart: number | null
  pushEvent: (e: MissionEvent) => void
  resetMission: () => void
  setMissionRunning: (r: boolean) => void
  // live state shown on Mission Control
  bloch: [Vec3, Vec3, Vec3]
  ghost: Vec3 | null
  fidelity: number | null
  setLive: (p: Partial<Pick<State, 'bloch' | 'ghost' | 'fidelity'>>) => void

  // demo-mode command channel: screens react to these counters
  demo: boolean
  setDemo: (d: boolean) => void
  tick: Record<string, number>
  fire: (key: string) => void
  caption: string | null
  setCaption: (c: string | null) => void
}

const Z: Vec3 = [0, 0, 1]

export const useStore = create<State>((set) => ({
  title: true,
  setTitle: (title) => set({ title }),
  guide: false,
  setGuide: (guide) => set({ guide }),
  help: false,
  setHelp: (help) => set({ help }),
  music: load('qrelay.music') !== 'off',
  setMusic: (music) => { save('qrelay.music', music ? 'on' : 'off'); set({ music }) },
  screen: (load('qrelay.screen') as Screen) || 'mission',
  setScreen: (screen) => { save('qrelay.screen', screen); set({ screen }) },
  booted: false,
  setBooted: (booted) => set({ booted }),
  backendOk: null,
  setBackendOk: (backendOk) => set({ backendOk }),
  mode: 'SIM',
  setMode: (mode) => set({ mode }),
  noise: 0,
  setNoise: (noise) => set({ noise }),
  lowPower: false,
  toggleLowPower: () => set((s) => ({ lowPower: !s.lowPower })),
  scanlines: true,
  toggleScanlines: () => set((s) => ({ scanlines: !s.scanlines })),
  presenter: false,
  togglePresenter: () => set((s) => ({ presenter: !s.presenter })),

  events: [],
  missionRunning: false,
  missionStart: null,
  pushEvent: (e) => set((s) => ({ events: [...s.events, e] })),
  resetMission: () => set({ events: [], bloch: [Z, Z, Z], ghost: null, fidelity: null, missionStart: Date.now() }),
  setMissionRunning: (missionRunning) => set({ missionRunning }),
  bloch: [Z, Z, Z],
  ghost: null,
  fidelity: null,
  setLive: (p) => set(p),

  demo: false,
  setDemo: (demo) => set({ demo }),
  tick: {},
  fire: (key) => set((s) => ({ tick: { ...s.tick, [key]: (s.tick[key] ?? 0) + 1 } })),
  caption: null,
  setCaption: (caption) => set({ caption }),
}))

export const CLASSICAL_BOUND = 2 / 3
