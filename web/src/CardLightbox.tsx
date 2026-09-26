import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Card } from './Card'
import type { CardEffectSet } from './CardEffects'
import { aimFoil } from './foil'
import type { CardCopy } from './types'

const backdrops = [
  { name: 'Charcoal', color: '#24282b', glow: '#747b80' },
  { name: 'Ivory', color: '#c9bda3', glow: '#fff2d4' },
  { name: 'Forest', color: '#173c36', glow: '#779c7e' },
  { name: 'Midnight blue', color: '#182b4d', glow: '#6f88bc' },
  { name: 'Burgundy', color: '#4b202d', glow: '#b87577' },
  { name: 'Plum', color: '#3e2851', glow: '#ad88bd' },
] as const
const lightboxEffects: CardEffectSet = { shell: [
  { id: 'temperature', className: 'lightbox-temperature' },
  { id: 'spotlight', className: 'lightbox-spotlight' },
] }

export function CardLightbox({ card, blank = false, onClose }: { card: CardCopy; blank?: boolean; onClose: () => void }) {
  const [surface, setSurface] = useState<'matte' | 'gloss'>('matte')
  const [backdrop, setBackdrop] = useState<(typeof backdrops)[number]>(backdrops[0])
  const [brightness, setBrightness] = useState(100)
  const [temperature, setTemperature] = useState(5000)
  const [light, setLight] = useState({ x: 50, y: 40 })
  const [zoom, setZoom] = useState(1)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const dialogRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const dragging = useRef<number | null>(null)

  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')]
      if (!focusable.length) return
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (!dialogRef.current.contains(document.activeElement)) { event.preventDefault(); first.focus(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => { window.removeEventListener('keydown', handleKey, true); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [onClose])

  function moveLight(event: PointerEvent<HTMLDivElement>) {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    setLight({ x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) })
    const cardFace = stage.querySelector<HTMLElement>('.card-perspective')
    if (cardFace) aimFoil(cardFace, event.clientX, event.clientY)
  }
  function startLight(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.lightbox-card')) return
    dragging.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    moveLight(event)
  }
  const warm = Math.max(0, (5000 - temperature) / 2300)
  const cool = Math.max(0, (temperature - 5000) / 2000)
  const cardWidth = Math.max(85, Math.min(350, (viewport.height - (viewport.width <= 700 ? 400 : 330)) * .696 / zoom, (viewport.width - 52) / zoom))
  const style = {
    '--backdrop': backdrop.color, '--backdrop-glow': backdrop.glow,
    '--light-x': `${light.x}%`, '--light-y': `${light.y}%`,
    '--light-level': brightness / 100, '--warm': warm, '--cool': cool,
    '--card-width': `${cardWidth}px`, '--zoom-clearance': `${Math.ceil((zoom - 1) * cardWidth / .696 / 2)}px`,
  } as CSSProperties

  return createPortal(<div className="lightbox" role="presentation" style={style}>
    <div className="lightbox-dialog" role="dialog" aria-modal="true" aria-label={`Lightbox: ${blank ? 'finish specimen' : card.name}`} ref={dialogRef}>
      <header className="lightbox-header"><div><span className="eyebrow">THE LIGHTBOX</span><strong>{blank ? 'Finish specimen' : card.name}</strong></div><button ref={closeRef} type="button" className="lightbox-close" onClick={onClose} aria-label="Close lightbox">×</button></header>
      <div className={`lightbox-stage ${surface}`} ref={stageRef} onPointerDown={startLight} onPointerMove={event => { if (dragging.current === event.pointerId) moveLight(event) }} onPointerUp={event => { if (dragging.current === event.pointerId) { dragging.current = null; event.currentTarget.releasePointerCapture(event.pointerId) } }} onPointerCancel={() => { dragging.current = null }}>
        <div className="lightbox-stage-grain" aria-hidden="true" />
        <div className="lightbox-light-marker" aria-hidden="true">✦</div>
        <div className="lightbox-card"><div className="lightbox-card-lighting"><Card card={card} blank={blank} large interactive effects={lightboxEffects} onZoomChange={setZoom} /></div></div>
        <span className="lightbox-stage-hint">DRAG THE LIGHT · TILT THE CARD</span>
      </div>
      <div className="lightbox-settings" aria-label="Lightbox settings">
        <fieldset><legend>Surface</legend><div className="lightbox-segmented"><button type="button" aria-pressed={surface === 'matte'} onClick={() => setSurface('matte')}>Matte</button><button type="button" aria-pressed={surface === 'gloss'} onClick={() => setSurface('gloss')}>Gloss</button></div></fieldset>
        <fieldset><legend>Backdrop</legend><div className="lightbox-swatches">{backdrops.map(option => <button key={option.name} type="button" className="lightbox-swatch" style={{ backgroundColor: option.color }} aria-label={`${option.name} backdrop`} aria-pressed={backdrop.name === option.name} title={option.name} onClick={() => setBackdrop(option)} />)}</div></fieldset>
        <label>Brightness <output>{brightness}%</output><input aria-label="Brightness" type="range" min="50" max="150" step="5" value={brightness} onChange={event => setBrightness(Number(event.target.value))} /></label>
        <label>Temperature <output>{temperature} K</output><input aria-label="Color temperature" type="range" min="2700" max="7000" step="100" value={temperature} onChange={event => setTemperature(Number(event.target.value))} /></label>
      </div>
    </div>
  </div>, document.body)
}
