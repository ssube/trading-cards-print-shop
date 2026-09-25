import { useRef, useState } from 'react'
import { api } from './api'
import { Card } from './Card'
import type { CardCopy } from './types'

const SHEET_WIDTH = 400
const SHEET_HEIGHT = 600
const MAX_CARDS = 90
const GAP = 10
const MARGIN = 15
const RATIO = 0.696

type Placement = { card: CardCopy; x: number; y: number; width: number; height: number }
export type PrintPreset = { title: string; copyIds: string[] }

export function presetQuantities(cards: CardCopy[], preset?: PrintPreset | null) {
  const available = new Set(cards.map(card => card.id))
  const result: Record<string, number> = {}
  for (const id of preset?.copyIds || []) if (available.has(id)) result[id] = (result[id] || 0) + 1
  return result
}


export function layoutSheet(cards: CardCopy[]): Placement[] {
  if (!cards.length || cards.length > 9) throw new Error('A sheet holds one to nine cards')
  const columns = cards.length >= 5 ? 3 : cards.length >= 3 ? 2 : cards.length === 2 ? 2 : 1
  const rows = Math.ceil(cards.length / columns)
  const width = Math.min((SHEET_WIDTH - MARGIN * 2 - GAP * (columns - 1)) / columns,
    (SHEET_HEIGHT - MARGIN * 2 - GAP * (rows - 1)) / rows * RATIO)
  const height = width / RATIO
  const top = (SHEET_HEIGHT - rows * height - (rows - 1) * GAP) / 2
  const counts = Array.from({ length: rows }, (_, row) => {
    if (rows === 3 && cards.length === 7) return [2, 3, 2][row]
    if (rows === 3 && cards.length === 8) return [2, 3, 3][row]
    if (rows === 2 && cards.length === 5) return [2, 3][row]
    const fullBefore = Math.floor(cards.length / rows)
    const extra = cards.length % rows
    return fullBefore + (row >= rows - extra ? 1 : 0)
  })
  let index = 0
  return counts.flatMap((count, row) => {
    const left = (SHEET_WIDTH - count * width - (count - 1) * GAP) / 2
    return Array.from({ length: count }, (_, column) => ({
      card: cards[index++], x: left + column * (width + GAP), y: top + row * (height + GAP), width, height,
    }))
  })
}

function PrintSheet({ cards, side, foil, quality, number }: { cards: CardCopy[]; side: 'front' | 'back'; foil: boolean; quality: boolean; number: number }) {
  const placements = layoutSheet(cards)
  return <div className={`physical-sheet physical-sheet-${side}`} data-sheet-number={number} data-side={side} aria-label={`4 by 6 ${side} sheet ${number}`}>
    {placements.map((placement, index) => <div className="physical-placement" key={`${placement.card.id}-${index}`} style={{
      left: side === 'back' ? SHEET_WIDTH - placement.x - placement.width : placement.x,
      top: placement.y, width: placement.width, height: placement.height,
    }}><Card card={placement.card} side={side} showFoil={foil} showQuality={quality} physical /></div>)}
  </div>
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function PhysicalPrint({ cards, paper, onCharged, preset }: { cards: CardCopy[]; paper: number; onCharged: () => Promise<void>; preset?: PrintPreset | null }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => presetQuantities(cards, preset))
  const [foil, setFoil] = useState(true)
  const [quality, setQuality] = useState(true)
  const [backs, setBacks] = useState(false)
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [ready, setReady] = useState<{ blob: Blob; name: string } | null>(null)
  const pending = useRef<{ signature: string; key: string } | null>(null)
  const sheetRoot = useRef<HTMLDivElement>(null)
  const chosen = cards.flatMap(card => Array.from({ length: quantities[card.id] || 0 }, () => card))
  const sheets = Array.from({ length: Math.ceil(chosen.length / 9) }, (_, index) => chosen.slice(index * 9, index * 9 + 9))
  const totalWear = cards.reduce((sum, card) => sum + (card.sleeved || card.slab_grade !== null ? 0 : quantities[card.id] || 0), 0)
  const canExport = chosen.length > 0 && chosen.length <= MAX_CARDS && paper >= sheets.length && cards.every(card => card.sleeved || card.slab_grade !== null || card.condition >= (quantities[card.id] || 0))
  function changeQuantity(card: CardCopy, amount: number) {
    const next = Math.max(0, Math.min(MAX_CARDS, (quantities[card.id] || 0) + amount))
    setQuantities(current => ({ ...current, [card.id]: next }))
    setReady(null)
    pending.current = null
  }
  function changeOption(update: () => void) { update(); setReady(null); pending.current = null }
  async function createExport() {
    if (!canExport || busy) return
    setBusy(true); setMessage('Rendering sheets…')
    try {
      await document.fonts.ready
      const { toPng } = await import('html-to-image')
      const nodes = [...(sheetRoot.current?.querySelectorAll<HTMLElement>('.physical-sheet') || [])]
      const images = await Promise.all(nodes.map(node => toPng(node, { pixelRatio: 3, backgroundColor: '#ffffff', cacheBust: true })))
      let blob: Blob
      let name: string
      if (format === 'pdf') {
        const { PDFDocument } = await import('pdf-lib')
        const document = await PDFDocument.create()
        for (const image of images) {
          const page = document.addPage([288, 432])
          const embedded = await document.embedPng(image)
          page.drawImage(embedded, { x: 0, y: 0, width: 288, height: 432 })
        }
        blob = new Blob([new Uint8Array(await document.save())], { type: 'application/pdf' })
        name = 'tcps-print-sheets.pdf'
      } else if (images.length === 1) {
        blob = await (await fetch(images[0])).blob()
        name = 'tcps-print-sheet.png'
      } else {
        const { default: JSZip } = await import('jszip')
        const zip = new JSZip()
        for (let index = 0; index < images.length; index++) {
          const side = nodes[index].dataset.side
          const number = nodes[index].dataset.sheetNumber
          zip.file(`sheet-${number}-${side}.png`, images[index].split(',')[1], { base64: true })
        }
        blob = await zip.generateAsync({ type: 'blob' })
        name = 'tcps-print-sheets.zip'
      }
      const items = cards.filter(card => quantities[card.id]).map(card => ({ copy_id: card.id, quantity: quantities[card.id] }))
      const signature = JSON.stringify(items)
      if (!pending.current || pending.current.signature !== signature) pending.current = { signature, key: crypto.randomUUID() }
      setMessage('Charging paper and handling wear…')
      await api('/physical-prints', 'POST', { items }, { 'Idempotency-Key': pending.current.key })
      await onCharged()
      setReady({ blob, name })
      download(blob, name)
      setMessage(`Ready: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} downloaded.`)
    } catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="page physical-print-page"><div className="page-intro"><p className="eyebrow">FROM SCREEN TO PAPER</p><h1>Print your <em>cards.</em></h1><p>Lay out your own copies on 4×6 photo, sticker, or card stock. Print at actual size; your printer may scale down.</p></div>
    <div className="physical-print-grid"><div className="builder-panel"><h2>Choose copies</h2>{preset && <p className="physical-deck-preset">Loaded from <strong>{preset.title}</strong>. Adjust quantities before exporting.</p>}<p>Each placement uses one condition unless its copy is protected. Each sheet uses one paper.</p>
      <div className="physical-card-list">{cards.map(card => <div className="physical-card-choice" key={card.id}><div><strong>{card.name}</strong><small>#{card.id.slice(0, 8)} · {card.condition}% condition{card.sleeved || card.slab_grade !== null ? ' · protected' : ''}</small></div><div className="physical-quantity"><button type="button" aria-label={`Remove ${card.name}`} disabled={!quantities[card.id]} onClick={() => changeQuantity(card, -1)}>−</button><span>{quantities[card.id] || 0}</span><button type="button" aria-label={`Add ${card.name}`} disabled={chosen.length >= MAX_CARDS || (!card.sleeved && card.slab_grade === null && (quantities[card.id] || 0) >= card.condition)} onClick={() => changeQuantity(card, 1)}>+</button></div></div>)}</div>
      <h2>Appearance</h2><label className="physical-option"><input type="checkbox" checked={foil} onChange={event => changeOption(() => setFoil(event.target.checked))} /> Show simulated foil finish</label><label className="physical-option"><input type="checkbox" checked={quality} onChange={event => changeOption(() => setQuality(event.target.checked))} /> Show print defects and paper wear</label><label className="physical-option"><input type="checkbox" checked={backs} onChange={event => changeOption(() => setBacks(event.target.checked))} /> Include aligned card backs</label>
      <label className="physical-format">File format<select value={format} onChange={event => changeOption(() => setFormat(event.target.value as 'pdf' | 'png'))}><option value="pdf">PDF · 4×6 inch pages</option><option value="png">PNG · 1200×1800 pixels</option></select></label>
      <div className="physical-cost">{chosen.length} card placements · {sheets.length} paper · {totalWear} condition across unprotected copies</div><button type="button" className="primary full" disabled={!canExport || busy} onClick={createExport}>{busy ? 'Preparing print files…' : 'Create print files ↗'}</button>{ready && <button type="button" className="secondary full" onClick={() => download(ready.blob, ready.name)}>Download again</button>}{message && <p role="status" className="physical-message">{message}</p>}
    </div><div className="physical-preview"><h2>Sheet preview</h2><p>All cards share a size and spacing on each sheet. Back sheets mirror card positions for two-sided printing.</p><div ref={sheetRoot} className="physical-sheets">{sheets.length ? sheets.flatMap((sheet, index) => [<div className="physical-sheet-wrap" key={`front-${index}`}><span>FRONT {index + 1}</span><PrintSheet cards={sheet} side="front" foil={foil} quality={quality} number={index + 1} /></div>, ...(backs ? [<div className="physical-sheet-wrap" key={`back-${index}`}><span>BACK {index + 1}</span><PrintSheet cards={sheet} side="back" foil={foil} quality={quality} number={index + 1} /></div>] : [])]) : <div className="physical-empty">Select a card to preview its 4×6 sheet.</div>}</div></div></div>
  </section>
}
