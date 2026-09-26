import { useRef, useState, type PointerEvent } from 'react'
import { aimFoil, aimFoilFromTilt, resetFoil } from './foil'
import type { CardCopy } from './types'
import { wearOpacity, wearTexture } from './wear'

export function Card({ card, interactive = false, onClick, large = false, blank = false, showFoil = true, showQuality = true, side = 'front', physical = false, onZoomChange, onOpenLightbox }: { card: CardCopy; interactive?: boolean; onClick?: () => void; large?: boolean; blank?: boolean; showFoil?: boolean; showQuality?: boolean; side?: 'front' | 'back'; physical?: boolean; onZoomChange?: (zoom: number) => void; onOpenLightbox?: () => void }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [flipped, setFlipped] = useState(side === 'back')
  const perspective = useRef<HTMLDivElement>(null)
  function move(event: PointerEvent<HTMLDivElement>) {
    aimFoil(event.currentTarget, event.clientX, event.clientY)
    if (!interactive || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTilt({ x: ((event.clientX - rect.left) / rect.width - .5) * 13, y: ((event.clientY - rect.top) / rect.height - .5) * -13 })
  }
  function beginTouch(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || event.pointerType !== 'touch') return
    event.currentTarget.setPointerCapture(event.pointerId)
    move(event)
  }
  function rotate(amount: number) {
    const next = { x: tilt.x + amount, y: tilt.y }
    setTilt(next)
    aimFoilFromTilt(perspective.current, next.x, next.y)
  }
  const artStyle = {
    '--cx': `${(showQuality ? card.centering_x : 0) * 2}%`, '--cy': `${(showQuality ? card.centering_y : 0) * 2}%`,
    '--sc': `${(showQuality ? card.shift_c : 0) * 2.4}%`, '--sm': `${(showQuality ? card.shift_m : 0) * 2.4}%`,
    '--sy': `${(showQuality ? card.shift_y : 0) * 2.4}%`, '--sk': `${(showQuality ? card.shift_k : 0) * 2.4}%`,
    '--oc': String(showQuality ? Math.min(.24, Math.abs(card.shift_c) * .4) : 0),
    '--om': String(showQuality ? Math.min(.24, Math.abs(card.shift_m) * .4) : 0),
    '--oy': String(showQuality ? Math.min(.24, Math.abs(card.shift_y) * .4) : 0),
    '--ok': String(showQuality ? Math.min(.14, Math.abs(card.shift_k) * .23) : 0),
    '--surface': String(showQuality ? card.surface : 0), '--edge': String(showQuality ? card.edge : 0),
  } as React.CSSProperties
  return <div className={`card-frame ${large ? 'card-large' : ''} ${physical ? 'physical-card' : ''}`}>
    <div className={`card-body ${card.slab_grade !== null ? 'slabbed' : card.sleeved === 1 ? 'sleeved' : ''}`} style={{ transform: `scale(${zoom}) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg)` }}>
    {card.slab_grade !== null && <div className="slab-label"><strong>THE ARCHIVIST</strong><span>GRADE {card.slab_grade}</span></div>}
    <div ref={perspective} className="card-perspective"
      onPointerDown={beginTouch} onPointerMove={move} onPointerLeave={event => { setTilt({ x: 0, y: 0 }); resetFoil(event.currentTarget) }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick() }}
      aria-label={onClick ? `Inspect ${card.name}` : undefined}>
      <div className={`card-flipper ${flipped ? 'is-flipped' : ''}`}>
      <article className={`trading-card finish-${card.finish_id} border-${card.border_id || 'classic'} effect-${showQuality ? card.color_effect : 'none'} ${showFoil ? '' : 'print-no-foil'} ${blank ? 'blank-finish-card' : ''}`} style={artStyle} aria-hidden={flipped}>
          {blank ? <div className="blank-card-stock"><span className="blank-card-corner">TC<span>:</span>PS</span><span className="blank-card-emblem">✧</span><span className="blank-card-rule" /><span className="blank-card-caption">AWAITING IMPRESSION</span></div> : <>
          <div className="card-ink"><div className="card-heading"><span className="card-type">{card.type_id}</span><span className="card-finish">{card.finish_id === 'standard' ? 'FIRST PRINT' : card.finish_id.toUpperCase()}</span></div>
          <h3>{card.name}</h3>
          <div className="art-window">
            <div className="art-registration">
              <img className="art-base" src={card.art_path} alt="" draggable="false" />
              <img className="channel channel-c" src={card.art_path} alt="" draggable="false" />
              <img className="channel channel-m" src={card.art_path} alt="" draggable="false" />
              <img className="channel channel-y" src={card.art_path} alt="" draggable="false" />
              <img className="channel channel-k" src={card.art_path} alt="" draggable="false" />
            </div><div className="art-sheen" /><div className="art-wear" />
          </div>
          <div className="card-rules"><div className="rule-title">{card.rule_names.join(' · ')}</div><p>{card.rule_text.join(' · ')}</p></div>
          <p className="card-flavor">“{card.flavor}”</p>
          <div className="card-foot"><span>№ {card.id.slice(0, 8).toUpperCase()}</span><span>{card.creator ? `by ${card.creator}` : 'Archive edition'}</span></div></div>
          </>}
          <div className="foil-shine" />{showQuality && <div className="wear-overlay" style={{ opacity: wearOpacity(card.condition), backgroundImage: wearTexture(card.id, card.condition) }} />}
      </article>
      <div className={`card-back back-${card.back_id || 'archive'} finish-${card.back_finish_id || (card.back_id === 'mischief' ? 'shimmer' : 'standard')} ${showFoil ? '' : 'print-no-foil'}`} aria-hidden={!flipped}><div className="back-mark">{card.back_id === 'atlas' ? '✧' : card.back_id === 'mischief' ? '♢' : <>TC<span>:</span>PS</>}</div><p>{card.back_id === 'atlas' ? <>THE STARLIT<br />ATLAS</> : card.back_id === 'mischief' ? <>THE VELVET<br />MISCHIEF</> : <>TRADING CARDS<br />PRINT SHOP</>}</p><small>{card.back_id === 'atlas' ? 'EVERY STAR HAS A PLACE' : card.back_id === 'mischief' ? 'A TRICK IN EVERY PRINT' : 'AN EDITION OF ONE, AGAIN AND AGAIN'}</small>{(card.back_finish_id || card.back_id === 'mischief') && <div className="foil-shine back-foil-shine" />}{showQuality && <div className="wear-overlay" style={{ opacity: wearOpacity(card.condition), backgroundImage: wearTexture(card.id, card.condition) }} />}</div>
      </div>
    </div>
    {card.slab_grade !== null ? <span className="slab-base-marker">✦ CERTIFIED · № {card.id.slice(0, 6).toUpperCase()}</span> : card.sleeved === 1 ? <span className="sleeve-badge">◇ SLEEVED</span> : null}
    </div>
    {interactive && <div className="card-controls"><button onClick={() => setFlipped(!flipped)}>{flipped ? 'Show front' : 'Flip card'}</button><label>Zoom <input type="range" min="1" max="1.6" step="0.05" value={zoom} onChange={e => { const next = Number(e.target.value); setZoom(next); onZoomChange?.(next) }} /></label><button onClick={() => rotate(-10)} aria-label="Rotate left">↶</button><button onClick={() => rotate(10)} aria-label="Rotate right">↷</button>{onOpenLightbox && <button type="button" onClick={onOpenLightbox} aria-label="Open lightbox">⛶ Lightbox</button>}</div>}
  </div>
}
