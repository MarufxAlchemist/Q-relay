// Generative ambient soundtrack + UI sound effects, synthesised live with WebAudio (no audio files, works offline).
// The arpeggio's notes are picked by QRNG bits; the noise slider muffles, detunes and hisses the music.

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

// A minor: Am - F - C - G (i - VI - III - VII), two bars each
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
const PENTA = [69, 72, 74, 76, 79, 81, 84, 86] // A minor pentatonic, two octaves
const BPM = 76
const SIXTEENTH = 60 / BPM / 4
const STEPS_PER_CHORD = 32

class AudioEngine {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private music!: GainNode
  private filter!: BiquadFilterNode
  private delaySend!: GainNode
  private hiss!: GainNode
  private timer: number | undefined
  private step = 0
  private nextTime = 0
  private noise = 0
  private bits: number[] = []
  private bitPos = 0
  playing = false

  private bit(): number {
    if (!this.bits.length) return Math.random() < 0.5 ? 0 : 1
    return this.bits[this.bitPos++ % this.bits.length]
  }
  private bitsInt(k: number): number {
    let v = 0
    for (let i = 0; i < k; i++) v = (v << 1) | this.bit()
    return v
  }

  setBits(bits: number[]) { if (bits.length) { this.bits = bits; this.bitPos = 0 } }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // reverb: convolver with a synthetic decaying-noise impulse
    const rev = ctx.createConvolver()
    const len = ctx.sampleRate * 2.8
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
    }
    rev.buffer = ir
    const revGain = ctx.createGain()
    revGain.gain.value = 0.55
    rev.connect(revGain).connect(this.master)

    this.filter = ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.frequency.value = 2600
    this.filter.Q.value = 0.7
    this.music = ctx.createGain()
    this.music.gain.value = 0.9
    this.music.connect(this.filter)
    this.filter.connect(this.master)
    this.filter.connect(rev)

    // echo for the arpeggio
    const delay = ctx.createDelay(1.5)
    delay.delayTime.value = SIXTEENTH * 3
    const fb = ctx.createGain()
    fb.gain.value = 0.38
    this.delaySend = ctx.createGain()
    this.delaySend.gain.value = 0.35
    this.delaySend.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(this.filter)

    // hiss that grows with the noise level
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const nd = nb.getChannelData(0)
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = nb
    src.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3000
    this.hiss = ctx.createGain()
    this.hiss.gain.value = 0
    src.connect(hp).connect(this.hiss).connect(this.master)
    src.start()
    return ctx
  }

  async start() {
    const ctx = this.ensure()
    if (ctx.state === 'suspended') await ctx.resume()
    if (this.playing) return
    this.playing = true
    this.step = 0
    this.nextTime = ctx.currentTime + 0.1
    this.master.gain.cancelScheduledValues(ctx.currentTime)
    this.master.gain.setTargetAtTime(0.32, ctx.currentTime, 0.8)
    this.timer = window.setInterval(() => this.schedule(), 60)
    this.applyNoise()
  }

  stop() {
    if (!this.ctx || !this.playing) return
    this.playing = false
    window.clearInterval(this.timer)
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
  }

  setNoise(v: number) { this.noise = Math.max(0, Math.min(1, v)); this.applyNoise() }

  private applyNoise() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.filter.frequency.setTargetAtTime(2600 - 2000 * this.noise, t, 0.3)
    this.hiss.gain.setTargetAtTime(this.playing ? 0.05 * this.noise * this.noise : 0, t, 0.3)
  }

  private schedule() {
    const ctx = this.ctx!
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime)
      this.step++
      this.nextTime += SIXTEENTH
    }
  }

  private playStep(step: number, t: number) {
    const chord = CHORDS[Math.floor(step / STEPS_PER_CHORD) % CHORDS.length]
    const inChord = step % STEPS_PER_CHORD
    if (inChord === 0) chord.forEach((m) => this.pad(m, t, SIXTEENTH * STEPS_PER_CHORD))
    if (inChord % 8 === 0) this.bass(chord[0] - 12, t)
    // arpeggio: a QRNG bit decides whether to play; 3 more bits pick the note
    if (step % 2 === 0 && this.bit() === 1 && Math.random() > this.noise * 0.6) {
      const m = PENTA[this.bitsInt(3)]
      this.pluck(m, t)
    }
  }

  private pad(m: number, t: number, dur: number) {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.045, t + 1.6)
    g.gain.setTargetAtTime(0, t + dur - 0.4, 0.8)
    g.connect(this.music)
    const spread = 6 + this.noise * 40
    for (const det of [-spread, spread]) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = midi(m)
      o.detune.value = det
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      o.connect(lp).connect(g)
      o.start(t)
      o.stop(t + dur + 3)
    }
  }

  private bass(m: number, t: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = midi(m)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.05)
    g.gain.exponentialRampToValueAtTime(0.001, t + SIXTEENTH * 7)
    o.connect(g).connect(this.music)
    o.start(t)
    o.stop(t + SIXTEENTH * 8)
  }

  private pluck(m: number, t: number) {
    const ctx = this.ctx!
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.07, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9)
    g.connect(this.music)
    g.connect(this.delaySend)
    const wobble = (Math.random() * 2 - 1) * 70 * this.noise
    for (const [type, mult, amp] of [['triangle', 1, 1], ['sine', 2, 0.4]] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = midi(m) * mult
      o.detune.value = wobble
      const og = ctx.createGain()
      og.gain.value = amp
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + 1)
    }
  }

  /** Short UI / event sounds. They play whenever sound is on (they need the audio context). */
  sfx(kind: 'click' | 'whoosh' | 'success' | 'fail' | 'tick') {
    if (!this.ctx || !this.playing) return
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    const tone = (f: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.08) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.linearRampToValueAtTime(vol, at + 0.008)
      g.gain.exponentialRampToValueAtTime(0.001, at + dur)
      o.connect(g).connect(this.master)
      g.connect(this.delaySend)
      o.start(at)
      o.stop(at + dur + 0.05)
    }
    if (kind === 'click') tone(1320, t, 0.06, 'sine', 0.05)
    if (kind === 'tick') tone(2000, t, 0.03, 'square', 0.02)
    if (kind === 'success') [72, 76, 79, 84].forEach((m, i) => tone(midi(m), t + i * 0.09, 0.5, 'triangle', 0.07))
    if (kind === 'fail') [64, 60, 55].forEach((m, i) => tone(midi(m), t + i * 0.12, 0.45, 'sawtooth', 0.04))
    if (kind === 'whoosh') {
      const len = ctx.sampleRate * 0.9
      const b = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = b.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len)
      const s = ctx.createBufferSource()
      s.buffer = b
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 6
      bp.frequency.setValueAtTime(400, t)
      bp.frequency.exponentialRampToValueAtTime(3500, t + 0.85)
      const g = ctx.createGain()
      g.gain.value = 0.18
      s.connect(bp).connect(g).connect(this.master)
      s.start(t)
    }
  }
}

export const audio = new AudioEngine()
