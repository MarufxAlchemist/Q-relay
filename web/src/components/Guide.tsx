import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore, type Screen } from '../store/useStore'
import { markGuideSeen } from '../screens/TitleScreen'
import { audio } from '../lib/audio'

// ------------------------------------------------------------------ small illustrations

const Arrow = ({ angle = 40, len = 44, color = '#4DFFA6', spin = false }: { angle?: number; len?: number; color?: string; spin?: boolean }) => (
  <g>
    {spin && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />}
    <line x1="0" y1="0" x2={len * Math.sin((angle * Math.PI) / 180)} y2={-len * Math.cos((angle * Math.PI) / 180)} stroke={color} strokeWidth="4" strokeLinecap="round" />
    <circle cx={len * Math.sin((angle * Math.PI) / 180)} cy={-len * Math.cos((angle * Math.PI) / 180)} r="5" fill="#fff" />
  </g>
)
const Sphere = ({ x = 0, color = '#4DFFA6', children, label }: { x?: number; color?: string; children?: ReactNode; label?: string }) => (
  <g transform={`translate(${x},0)`}>
    <circle r="52" fill={`${color}14`} stroke={color} strokeWidth="1.6" />
    <ellipse rx="52" ry="15" fill="none" stroke={`${color}66`} />
    <text y="-58" textAnchor="middle" fontSize="11" fill="#8FA89C">|0⟩</text>
    <text y="68" textAnchor="middle" fontSize="11" fill="#8FA89C">|1⟩</text>
    {children}
    {label && <text y="88" textAnchor="middle" fontSize="12" fill="#CFE3D8" letterSpacing="2">{label}</text>}
  </g>
)

const ART: Record<string, ReactNode> = {
  welcome: (
    <svg viewBox="-200 -90 400 190">
      <Sphere x={-120} label="ALICE"><Arrow angle={50} spin /></Sphere>
      <Sphere x={120} color="#F5C84B" label="BOB"><Arrow angle={50} color="#F5C84B" spin /></Sphere>
      <path d="M-66,0 C-30,-30 30,30 66,0" stroke="#8F7CFF" strokeWidth="3" fill="none" strokeDasharray="6 5">
        <animate attributeName="stroke-dashoffset" from="22" to="0" dur="1s" repeatCount="indefinite" />
      </path>
    </svg>
  ),
  qubit: (
    <svg viewBox="-200 -90 400 190">
      <Sphere x={-120} label="CERTAIN 0"><Arrow angle={0} /></Sphere>
      <Sphere x={0} color="#8F7CFF" label="BOTH AT ONCE"><Arrow angle={90} color="#8F7CFF" /></Sphere>
      <Sphere x={120} color="#F5C84B" label="BLURRY (ENTANGLED)"><Arrow angle={130} len={16} color="#F5C84B" /></Sphere>
    </svg>
  ),
  qrng: (
    <svg viewBox="-200 -90 400 190">
      <Sphere x={-110}><Arrow angle={90} spin /></Sphere>
      <text x="-30" y="5" fontSize="26" fill="#FF8A5B">→</text>
      {Array.from({ length: 24 }, (_, i) => (
        <text key={i} x={10 + (i % 8) * 22} y={-30 + Math.floor(i / 8) * 30} fontSize="20" fontFamily="JetBrains Mono" fill={i % 3 ? '#4DFFA6' : '#F5C84B'}>
          {(i * 7) % 3 ? 1 : 0}
          <animate attributeName="opacity" values="0;1;1" dur={`${0.4 + (i % 5) * 0.2}s`} />
        </text>
      ))}
    </svg>
  ),
  teleport: (
    <svg viewBox="-200 -90 400 190">
      <Sphere x={-120} label="ALICE"><Arrow angle={40} /></Sphere>
      <Sphere x={120} color="#F5C84B" label="BOB"><Arrow angle={40} color="#F5C84B" /></Sphere>
      {[0, 1].map((i) => (
        <rect key={i} y={34} width="14" height="14" rx="2" fill={i ? '#F5C84B' : '#4DFFA6'}>
          <animate attributeName="x" values="-70;56" dur="1.8s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
        </rect>
      ))}
      <text y="-8" textAnchor="middle" fontSize="12" fill="#8F7CFF">entangled pair</text>
      <text y="70" textAnchor="middle" fontSize="12" fill="#8FA89C">+ 2 ordinary bits</text>
    </svg>
  ),
  fidelity: (
    <svg viewBox="-200 -90 400 190">
      <path d="M-90,40 A100,100 0 0 1 90,40" stroke="#233A30" strokeWidth="14" fill="none" />
      <path d="M-90,40 A100,100 0 0 1 20,-58" stroke="#B6FF6A" strokeWidth="14" fill="none" />
      <line x1="-10" y1="-62" x2="-16" y2="-38" stroke="#FF8A5B" strokeWidth="4" />
      <text x="-26" y="-70" fontSize="13" fill="#FF8A5B">2/3 line</text>
      <text y="30" textAnchor="middle" fontSize="30" fill="#B6FF6A" fontFamily="JetBrains Mono">0.96</text>
    </svg>
  ),
  dj: (
    <svg viewBox="-200 -90 400 190">
      <rect x="-50" y="-50" width="100" height="100" rx="10" fill="#07110D" stroke="#FF8A5B" strokeWidth="2" />
      <text y="16" textAnchor="middle" fontSize="54" fill="#FF8A5B">?</text>
      <text x="-190" y="-30" fontSize="13" fill="#F5C84B">classical: ask up to</text>
      <text x="-190" y="-10" fontSize="13" fill="#F5C84B">half + 1 questions</text>
      <text x="80" y="-30" fontSize="13" fill="#4DFFA6">quantum:</text>
      <text x="80" y="-10" fontSize="13" fill="#4DFFA6">ONE question</text>
    </svg>
  ),
  noise: (
    <svg viewBox="-200 -90 400 190">
      <path d="M-180,0 Q-150,-40 -120,0 T-60,0 T0,0" stroke="#4DFFA6" strokeWidth="3" fill="none" />
      <path d="M0,0 L10,-18 L18,12 L28,-25 L36,20 L46,-8 L54,14 L64,-30 L74,10 L84,-12 L96,22 L106,-16 L118,8 L130,-20 L142,16 L156,-6 L170,10 L180,-4" stroke="#FF5470" strokeWidth="3" fill="none" />
      <text x="-120" y="50" fontSize="13" fill="#4DFFA6">clean: quantum works</text>
      <text x="40" y="50" fontSize="13" fill="#FF5470">noisy: magic fades</text>
    </svg>
  ),
  controls: (
    <svg viewBox="-200 -90 400 190">
      {[['1–7', 'screens'], ['D', 'auto demo'], ['H', 'help'], ['M', 'music'], ['P', 'big captions'], ['Esc', 'menu']].map(([k, d], i) => (
        <g key={k} transform={`translate(${-170 + (i % 3) * 120},${-40 + Math.floor(i / 3) * 70})`}>
          <rect width="44" height="34" rx="5" fill="#07110D" stroke="#4DFFA6" />
          <text x="22" y="22" textAnchor="middle" fontSize="14" fill="#4DFFA6" fontFamily="JetBrains Mono">{k}</text>
          <text x="52" y="22" fontSize="12" fill="#CFE3D8">{d}</text>
        </g>
      ))}
    </svg>
  ),
}

interface StepDef { art: string; title: string; body: ReactNode; tryIt?: string; go?: Screen }

const STEPS: StepDef[] = [
  { art: 'welcome', title: 'Welcome to Q-Relay', go: 'mission',
    body: <>Q-Relay is a <b>tiny quantum internet</b> running in your browser. Two people, <b className="cyan">Alice</b> and <b className="magenta">Bob</b>, use quantum physics to do three things: make <b>truly random numbers</b>, <b>send a quantum state</b> without carrying it, and <b>solve a puzzle in one try</b> that a normal computer needs many tries for.</>,
    tryIt: 'Each step below has a “Show me” button that takes you to the right screen.' },
  { art: 'qubit', title: 'What is a qubit? (the glowing balls)',
    body: <>A normal bit is 0 or 1. A <b>qubit</b> can be 0, 1, or a mix of both. We draw it as an <b>arrow inside a ball</b>: pointing <b>up = 0</b>, <b>down = 1</b>, <b>sideways = both at once</b>. When two qubits are <b>entangled</b> (linked), each one alone looks “blurry”, and its <b>arrow shrinks</b>. That's real physics, not a bug.</> },
  { art: 'qrng', title: 'Stage 1 · Random numbers from nature', go: 'qrng',
    body: <>Put a qubit sideways and measure it: it lands on 0 or 1 like a <b>perfect coin</b>. Nobody, not even the universe, knows the answer in advance. We make a million such bits and run <b>10 detective tests</b> to look for patterns. A badly made classical generator (RANDU) gets caught red-handed.</>,
    tryIt: 'In QRNG Lab press “Break the PRNG” and watch the stripes appear.' },
  { art: 'teleport', title: 'Stage 2 · Teleportation', go: 'teleport',
    body: <>Alice has a secret qubit. She can't copy it (nature forbids copying) and she can't look at it without ruining it. Instead, Alice and Bob share an <b>entangled pair</b>. Alice does a joint measurement and phones Bob <b>two ordinary bits</b>. Bob uses them to fix his qubit, and now <b>he has the exact state</b>. Alice's original is destroyed: it was <b>moved, not copied</b>.</>,
    tryIt: 'In Teleport Lab drag the arrow on the left ball and watch Bob copy it.' },
  { art: 'fidelity', title: 'The score: fidelity and the magic 2/3',
    body: <><b>Fidelity</b> measures how close Bob's state is to Alice's: <b>1 = perfect</b>. Without quantum tricks the best you can ever do is <b>2/3</b> (Alice measures, describes it over the phone, Bob guesses). So anything <b>above 2/3</b> proves the quantum link is doing real work.</> },
  { art: 'dj', title: 'Stage 3 · The one-question puzzle', go: 'dj',
    body: <>A sealed box answers yes/no for every input. It's either <b>boring</b> (always the same answer) or <b>fair</b> (exactly half yes). A normal computer may need to ask <b>more than half</b> of all inputs to be sure. The <b>Deutsch–Jozsa</b> algorithm asks <b>once</b>, using waves that cancel out (interference). Bob does this using a helper qubit that Alice <b>teleported</b> to him.</>,
    tryIt: 'Try “Beat the Oracle” (screen 5): you click tiles, the quantum computer asks once.' },
  { art: 'noise', title: 'Noise: why quantum is hard', go: 'mission',
    body: <>Real quantum chips are <b>noisy</b>: tiny disturbances blur the qubits. Slide the <b>Noise</b> control up: the glowing link flickers, the arrows shrink, the music gets muddy, and fidelity drops <b>below 2/3</b>. That's the point where the quantum advantage is gone.</>,
    tryIt: 'On Mission Control, press LAUNCH, then drag Noise to the right.' },
  { art: 'controls', title: 'Controls and honesty',
    body: <>Badges tell you where each number comes from: <b className="cyan">SIM</b> = simulated on a normal computer (its “randomness” is really pseudo-random), <b className="amber">EMU</b> = simulated with a real IBM chip's noise, <b className="green">HW</b> = a real quantum computer. Press <b>?</b> on any screen for a plain-English explanation.</> },
]

export function Guide() {
  const open = useStore((s) => s.guide)
  const setGuide = useStore((s) => s.setGuide)
  const setScreen = useStore((s) => s.setScreen)
  const setTitle = useStore((s) => s.setTitle)
  const [i, setI] = useState(0)
  const close = () => { markGuideSeen(); setGuide(false); setI(0) }
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const st = STEPS[i]
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" style={{ zIndex: 120, background: 'rgba(3,5,10,0.86)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="guide-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="lbl" style={{ color: 'var(--amber)' }}>Mission guide · {i + 1} / {STEPS.length}</span>
              <button className="btn" style={{ padding: '3px 10px' }} onClick={close}>Skip ✕</button>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
                <div className="guide-art">{ART[st.art]}</div>
                <h2 className="guide-title">{st.title}</h2>
                <p className="guide-body">{st.body}</p>
                {st.tryIt && <p className="guide-try">▶ {st.tryIt}</p>}
              </motion.div>
            </AnimatePresence>
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <div className="row" style={{ gap: 5 }}>
                {STEPS.map((_, k) => <button key={k} onClick={() => setI(k)} className={`dot ${k === i ? 'on' : ''}`} aria-label={`step ${k + 1}`} />)}
              </div>
              <div className="row">
                {st.go && <button className="btn" onClick={() => { setScreen(st.go!); setTitle(false); close() }}>Show me</button>}
                <button className="btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
                {i < STEPS.length - 1
                  ? <button className="btn magenta" onClick={() => { audio.sfx('click'); setI(i + 1) }}>Next →</button>
                  : <button className="btn magenta" onClick={() => { setTitle(false); close() }}>Start the mission ➔</button>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ------------------------------------------------------------------ per-screen plain-English help

const HELP: Record<Screen, { title: string; items: [string, string][] }> = {
  mission: { title: 'Mission Control: the whole story on one screen', items: [
    ['LAUNCH MISSION', 'Runs all three stages in order. The text at the bottom narrates what is happening.'],
    ['Left ball (Alice)', 'The secret qubit Alice wants to send. Its direction was picked by quantum random numbers.'],
    ['Small purple ball', "Alice's half of the entangled pair. Its arrow shrinks to nothing when it gets entangled."],
    ['Glowing beam', 'The entanglement link between Alice and Bob. More noise makes it flicker and break.'],
    ['Little cubes on the wire', 'The 2 ordinary bits Alice sends to Bob. Teleportation needs these, so nothing goes faster than light.'],
    ['Right ball (Bob) + white ghost', "Bob's qubit and, in white, what it should be. When they line up, the transfer worked."],
    ['Fidelity gauge', '1 = perfect copy. Below the 2/3 mark a non-quantum method could do as well.'],
    ['Bottom right bars', 'The one-question puzzle: tall bar at 000 means “boring/constant”, no bar there means “fair/balanced”.'],
  ] },
  qrng: { title: 'QRNG Lab: are these bits really random?', items: [
    ['Story / Overview', 'Story walks you through one idea at a time: press Next (or the → key), or Play story to let it narrate itself. Overview shows every chart at once.'],
    ['Falling bits', 'The random 0s and 1s as they come out.'],
    ['0/1 counts', 'Should be about 50/50. The orange band is how much wobble pure chance allows.'],
    ['Random walk', 'Go up for 1, down for 0. Random bits wander but stay inside the purple zone.'],
    ['Fingerprints', 'Bits drawn as pixels. Random looks like TV static. A bad generator shows stripes.'],
    ['Test table', '10 standard tests. Green = no pattern found, red = pattern found. Passing is not proof, it just means nothing suspicious.'],
    ['Bias fixing', 'If a coin is unfair (40/60), these tricks turn it back into a fair one, at the cost of throwing some bits away.'],
    ['SIM / EMU / HW', 'SIM bits are made by a simulator (secretly pseudo-random). Only HW bits come from a real quantum chip.'],
  ] },
  teleport: { title: 'Teleport Lab: send any state you like', items: [
    ['Story / Overview', 'Story walks you through one idea at a time: press Next (or the → key), or Play story to let it narrate itself. Overview shows every chart at once.'],
    ['Drag the left ball', 'Choose any state for Alice. Bob (right) follows automatically.'],
    ['Step slider + circuit', 'Replay the protocol gate by gate. The lit box in the circuit is the current step.'],
    ['Branch table', "Alice's measurement has 4 possible results. In every one, Bob ends up perfect (F = 1)."],
    ['Tomography', "Checking Bob's qubit the way a lab would: measure it many times in 3 directions."],
    ['Charts at the bottom', 'How fidelity falls as noise rises, and where it crosses the 2/3 line.'],
  ] },
  dj: { title: 'DJ Lab: the one-question puzzle', items: [
    ['Story / Overview', 'Story walks you through one idea at a time: press Next (or the → key), or Play story to let it narrate itself. Overview shows every chart at once.'],
    ['Oracle gallery', 'Pick a secret function (“box”). Constant = always same answer. Balanced = half yes, half no.'],
    ['Truth table', 'The answers hidden inside the box (pink = 1). The quantum computer never looks at this.'],
    ['Amplitude bars', 'Watch the 4 phases: spread over all inputs, flip signs where the answer is 1, then let them cancel or add up.'],
    ['Verdict', 'One query is enough to know constant vs balanced.'],
    ['Query race', 'How many questions a normal computer needs in the worst case, compared with 1.'],
    ['Bottom charts', 'Noise makes it fail more often, especially for complicated boxes.'],
  ] },
  game: { title: 'Beat the Oracle: try it yourself', items: [
    ['Tiles', 'Click to ask the box about one input. Pink = 1, blue = 0.'],
    ['Counters', 'How many questions you used, and how many you might need to be 100% sure.'],
    ['Ask the quantum computer', 'Solves it with one question, then teleports the answer to Bob.'],
  ] },
  hardware: { title: 'Hardware: simulator vs real chips', items: [
    ['Cards', 'Where results came from: simulator, emulated chip, or a real IBM quantum computer (with job ID).'],
    ['Bars', 'Real-world teleport quality per test state. Anything above the orange 2/3 line is genuinely quantum.'],
    ['Process matrix', 'A fingerprint of the whole channel. A perfect one is 1s on the diagonal and 0s elsewhere.'],
  ] },
  report: { title: 'Report: for the judges', items: [
    ['Table', 'Where each requirement of the problem statements is implemented.'],
    ['Downloads', 'All results as JSON, plus the figures as SVG.'],
  ] },
}

export function Help() {
  const open = useStore((s) => s.help)
  const setHelp = useStore((s) => s.setHelp)
  const screen = useStore((s) => s.screen)
  const h = HELP[screen]
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" style={{ zIndex: 110, background: 'rgba(3,5,10,0.8)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setHelp(false)}>
          <motion.div className="guide-card" initial={{ y: 16 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="lbl" style={{ color: 'var(--amber)' }}>In plain words</span>
              <button className="btn" style={{ padding: '3px 10px' }} onClick={() => setHelp(false)}>Close ✕</button>
            </div>
            <h2 className="guide-title">{h.title}</h2>
            <dl className="help-list">
              {h.items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
