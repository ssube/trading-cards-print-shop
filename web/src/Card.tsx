import { useState, type PointerEvent } from 'react'
import type { CardCopy } from './types'

export function Card({ card, interactive = false, onClick, large = false, blank = false }: { card: CardCopy; interactive?: boolean; onClick?: () => void; large?: boolean; blank?: boolean }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [flipped, setFlipped] = useState(false)
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!interactive || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTilt({ x: ((event.clientX - rect.left) / rect.width - .5) * 13, y: ((event.clientY - rect.top) / rect.height - .5) * -13 })
  }
  const artStyle = {
    '--cx': `${card.centering_x * 2.3}px`, '--cy': `${card.centering_y * 2.3}px`,
    '--sc': `${card.shift_c * 2}px`, '--sm': `${card.shift_m * 2}px`,
    '--sy': `${card.shift_y * 2}px`, '--sk': `${card.shift_k * 2}px`,
    '--surface': String(card.surface), '--edge': String(card.edge),
  } as React.CSSProperties
  return <div className={`card-frame ${large ? 'card-large' : ''} ${card.slab_grade !== null ? 'slabbed' : ''}`}>
    {card.slab_grade !== null && <div className="slab-label"><strong>THE ARCHIVIST</strong><span>{card.slab_grade} · {card.grade_name}</span></div>}
    <div className="card-perspective" style={{ transform: `scale(${zoom}) rotateY(${flipped ? 180 + tilt.x : tilt.x}deg) rotateX(${tilt.y}deg)` }}
      onPointerMove={move} onPointerLeave={() => setTilt({ x: 0, y: 0 })} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={e => { if (onClick && (e.key === 'Enter' || e.key === ' ')) onClick() }}
      aria-label={onClick ? `Inspect ${card.name}` : undefined}>
      <article className={`trading-card finish-${card.finish_id} effect-${card.color_effect} ${flipped ? 'is-flipped' : ''} ${blank ? 'blank-finish-card' : ''}`} style={artStyle}>
        {flipped ? <div className="card-back"><div className="back-mark">C<span>:</span>P</div><p>CARDS<br />THE PRINTING</p><small>AN EDITION OF ONE, AGAIN AND AGAIN</small></div> : <>
          {blank ? <div className="blank-card-stock"><span className="blank-card-corner">C<span>:</span>P</span><span className="blank-card-emblem">✧</span><span className="blank-card-rule" /><span className="blank-card-caption">AWAITING IMPRESSION</span></div> : <>
          <div className="card-heading"><span className="card-type">{card.type_id}</span><span className="card-finish">{card.finish_id === 'standard' ? 'FIRST PRINT' : card.finish_id.toUpperCase()}</span></div>
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
          <div className="card-rules"><div className="rule-title">{card.rule_ids.join(' · ')}</div><p>{card.rule_text.join(' · ')}</p></div>
          <p className="card-flavor">“{card.flavor}”</p>
          <div className="card-foot"><span>№ {card.id.slice(0, 8).toUpperCase()}</span><span>{card.creator ? `by ${card.creator}` : 'Archive edition'}</span></div>
          </>}
          <div className="foil-shine" /><div className="wear-overlay" style={{ opacity: Math.max(0, (100 - card.condition) / 190) }} />
        </>}
      </article>
    </div>
    {card.sleeved === 1 && <span className="sleeve-badge">SLEEVED</span>}
    {interactive && <div className="card-controls"><button onClick={() => setFlipped(!flipped)}>{flipped ? 'Show front' : 'Flip card'}</button><label>Zoom <input type="range" min="1" max="1.6" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} /></label><button onClick={() => setTilt({ x: tilt.x - 10, y: tilt.y })} aria-label="Rotate left">↶</button><button onClick={() => setTilt({ x: tilt.x + 10, y: tilt.y })} aria-label="Rotate right">↷</button></div>}
  </div>
}
