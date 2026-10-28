import { useEffect, useRef } from 'react'
import { useStore } from '../store/useStore'

/** Full-screen twinkling starfield with the odd shooting star. Static (drawn once) in low-power mode. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)
  const low = useStore((s) => s.lowPower)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')!
    let raf = 0
    let stars: { x: number; y: number; r: number; p: number; s: number; tint: string }[] = []
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null
    const TINTS = ['255,255,255', '200,255,225', '255,236,180', '190,210,255']
    const resize = () => {
      const dpr = Math.min(devicePixelRatio, 2)
      c.width = innerWidth * dpr
      c.height = innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const n = Math.round((innerWidth * innerHeight) / 4200)
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * innerWidth, y: Math.random() * innerHeight, r: Math.random() ** 3 * 1.6 + 0.25,
        p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6, tint: TINTS[Math.floor(Math.random() * TINTS.length)],
      }))
    }
    const draw = (t: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      for (const st of stars) {
        const a = low ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.p + t * 0.001 * st.s))
        ctx.fillStyle = `rgba(${st.tint},${a * (st.r > 1 ? 0.95 : 0.7)})`
        ctx.beginPath()
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2)
        ctx.fill()
      }
      if (!low) {
        if (!shoot && Math.random() < 0.0025) {
          shoot = { x: Math.random() * innerWidth * 0.8, y: Math.random() * innerHeight * 0.4, vx: 7 + Math.random() * 5, vy: 2.5 + Math.random() * 2, life: 1 }
        }
        if (shoot) {
          const g = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14)
          g.addColorStop(0, `rgba(200,255,225,${shoot.life})`)
          g.addColorStop(1, 'rgba(200,255,225,0)')
          ctx.strokeStyle = g
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(shoot.x, shoot.y)
          ctx.lineTo(shoot.x - shoot.vx * 14, shoot.y - shoot.vy * 14)
          ctx.stroke()
          shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life -= 0.012
          if (shoot.life <= 0) shoot = null
        }
        raf = requestAnimationFrame(draw)
      }
    }
    resize()
    raf = requestAnimationFrame(draw)
    const onResize = () => { resize(); if (low) draw(0) }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [low])
  return <canvas ref={ref} className="starfield" />
}
