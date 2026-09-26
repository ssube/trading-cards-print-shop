import { useState } from 'react'
import { Card } from './Card'
import type { CardCopy, Part } from './types'

const blankStock: CardCopy = {
  id: 'blank-preview', design_id: 'blank-preview', owner_id: null, creator: null, origin_id: null,
  type_id: 'blank', rule_ids: [], rule_names: [], rule_text: [], theme_id: 'storybook', finish_id: 'standard', border_id: 'classic', back_id: 'archive', back_finish_id: null,
  name: 'Blank stock', flavor: '', art_path: '', print_score: 100, condition: 100,
  centering_x: 0, centering_y: 0, shift_c: 0, shift_m: 0, shift_y: 0, shift_k: 0,
  color_effect: 'none', surface: 0, edge: 0, sleeved: 0, slab_grade: null, listed: 0,
  grade: 10, grade_name: 'Gem Mint', estimated_grade: 'Gem Mint', exact_grade_visible: true,
}

function foilCost(finish: Part) {
  try { return Number((JSON.parse(finish.cost_json) as Record<string, number>).foil || 0) }
  catch { return 0 }
}

export function FinishGallery({ catalog, library, onUseFinish, offline = false, finishId, onSelectFinish }: {
  catalog: Part[]
  library: CardCopy[]
  onUseFinish: (finishId: string) => void
  offline?: boolean
  finishId: string
  onSelectFinish: (id: string) => void
}) {
  const finishes = catalog.filter(part => part.kind === 'finish')
  const standardCards = library.filter(card => card.finish_id === 'standard')
  const [sourceId, setSourceId] = useState('')
  const [previewZoom, setPreviewZoom] = useState(1)
  const source = standardCards.find(card => card.id === sourceId)
  const selectedFinish = finishes.find(finish => finish.id === finishId) || finishes[0]
  const specimen = (id: string) => ({ ...(source || blankStock), finish_id: id, slab_grade: null, sleeved: 0 })

  return <section className="page finish-gallery-page">
    <div className="page-intro finish-gallery-intro">
      <p className="eyebrow">THE FINISH ATELIER</p>
      <h1>See it in a <em>different light.</em></h1>
      <p>Try every finish on blank stock or any standard card in your box. These are previews; your copies stay exactly as they are.</p>
    </div>
    <div className="finish-gallery-layout">
      <div className="finish-showcase" style={{ '--zoom-clearance': `${Math.ceil((previewZoom - 1) * 252)}px`, '--zoom-card-max': `calc(${100 / previewZoom}vw - ${72 / previewZoom}px)` } as React.CSSProperties}>
        <div className="finish-showcase-top"><span>✦ &nbsp; LIVE SPECIMEN</span><span>MOVE TO CATCH THE LIGHT</span></div>
        <div className="finish-showcase-card"><Card key={`${source?.id || 'blank'}-${selectedFinish?.id || 'standard'}`} card={specimen(selectedFinish?.id || 'standard')} blank={!source} large interactive onZoomChange={setPreviewZoom} /></div>
        <div className="finish-showcase-bottom"><span>{source ? source.name : 'Blank print stock'}</span><strong>{selectedFinish?.name || 'Standard'}</strong></div>
      </div>
      <div className="finish-gallery-controls">
        <div className="finish-source-panel">
          <p className="eyebrow">01 / CHOOSE YOUR CANVAS</p>
          <h2>The card beneath the shine</h2>
          <label htmlFor="finish-source">Preview on</label>
          <select id="finish-source" value={source?.id || ''} onChange={event => { setSourceId(event.target.value); setPreviewZoom(1) }}>
            <option value="">Blank print stock</option>
            {standardCards.map(card => <option key={card.id} value={card.id}>{card.name} · #{card.id.slice(0, 6).toUpperCase()}</option>)}
          </select>
          <p className="finish-source-hint">Only standard copies appear here, so the preview shows the finish itself.</p>
        </div>
        <div className="finish-options-panel">
          <p className="eyebrow">02 / EXPLORE THE FINISHES</p>
          <h2>Light, layered on paper</h2>
          <div className="finish-options" role="region" aria-label="Finishes" tabIndex={0}>
            {finishes.map(finish => <button key={finish.id} type="button" className={`finish-option ${selectedFinish?.id === finish.id ? 'selected' : ''}`}
              aria-pressed={selectedFinish?.id === finish.id} onClick={() => { onSelectFinish(finish.id); setPreviewZoom(1) }}>
              <span className="finish-option-card"><Card card={specimen(finish.id)} blank={!source} /></span>
              <span className="finish-option-copy"><strong>{finish.name}</strong><small>{finish.description}</small><span>{finish.learned ? 'LEARNED' : 'UNDISCOVERED'} · {foilCost(finish) ? `${foilCost(finish)} FOIL` : 'NO FOIL'}</span></span>
              <span className="finish-option-arrow">↗</span>
            </button>)}
          </div>
        </div>
        {selectedFinish && <div className="finish-gallery-action"><p><strong>{selectedFinish.name}</strong> · {selectedFinish.description}</p><button className="primary" type="button" disabled={!selectedFinish.learned} onClick={() => onUseFinish(selectedFinish.id)}>{selectedFinish.learned ? 'Use at the press ↗' : offline ? 'Learn from a discovery card' : 'Learn through trading'}</button></div>}
      </div>
    </div>
  </section>
}
