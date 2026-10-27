import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Measures its box and renders children at exactly that pixel size, so charts fill grid cells without overflow. */
export function Fill({ children, style, minH = 60 }: { children: (w: number, h: number) => ReactNode; style?: CSSProperties; minH?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setSize((s) => (Math.abs(s[0] - width) < 1 && Math.abs(s[1] - height) < 1 ? s : [Math.floor(width), Math.floor(height)]))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} style={{ flex: 1, minHeight: minH, minWidth: 0, position: 'relative', overflow: 'hidden', ...style }}>
      {size[0] > 20 && size[1] > 20 && <div style={{ position: 'absolute', inset: 0 }}>{children(size[0], size[1])}</div>}
    </div>
  )
}

/** A panel whose body flexes to fill the remaining height. */
export function Panel({ title, right, children, style, className = '' }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; style?: CSSProperties; className?: string
}) {
  return (
    <section className={`panel flex ${className}`} style={style}>
      {title !== undefined && <h3>{title}<span className="grow" />{right}</h3>}
      {children}
    </section>
  )
}
