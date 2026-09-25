import { useEffect, useState } from 'react'
import { api } from './api'

type Mill = { pulp: number; cats: number; roller: boolean; ink_vat: boolean; paper_today: number; ink_today: number; paper_limit: number; ink_limit: number; next_cat_cost: number | null; card_id?: string | null }

export function PapermillGame({ onChanged }: { onChanged: () => Promise<void> }) {
  const [mill, setMill] = useState<Mill | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function load() {
    try { setMill(await api<Mill>('/games/papermill')); setError(''); await onChanged() }
    catch (reason) { setError((reason as Error).message) }
  }
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30000); return () => window.clearInterval(timer) }, [])
  async function action(path: string, message: string) {
    if (busy) return
    setBusy(true)
    try {
      const next = await api<Mill>(path, 'POST')
      setMill(next)
      await onChanged()
      setNotice(next.card_id ? `${message} A new card joined your library.` : message)
      setError('')
    } catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="game-detail papermill-page">
    <div className="page-intro"><p className="eyebrow">FELINE PAPERMILL</p><h1>Paperwork with <em>paws.</em></h1><p>Pull the pulper, hire the cats, and let the mill make supplies while you're away.</p></div>
    {error && <p role="alert" className="game-error">{error}</p>}{notice && <p role="status" className="game-notice">{notice}</p>}
    {mill && <><div className="mill-layout"><div className="mill-machine"><div className="mill-cat-row" aria-label={`${mill.cats} cats at work`}>{Array.from({ length: mill.cats }, (_, i) => <span key={i}>🐈</span>)}{mill.cats === 0 && <span className="mill-empty">The mill awaits its first forecat.</span>}</div><div className="mill-wheel">✧<span>THE PAPER MILL</span></div><button className="primary" disabled={busy} onClick={() => void action('/games/papermill/tap', '+1 pulp')}>Pull the pulper ↗</button></div><div className="mill-ledger"><p className="eyebrow">MILL LEDGER</p><div><strong>{mill.pulp}</strong><span>pulp</span></div><div><strong>{mill.cats} / 6</strong><span>cats hired</span></div><div><strong>{mill.paper_today} / {mill.paper_limit}</strong><span>paper made today</span></div><div><strong>{mill.ink_today} / {mill.ink_limit}</strong><span>ink made today</span></div><p>Production continues while you are away. Daily output resets at 00:00 UTC.</p></div></div><div className="mill-shop"><h2>Staff & equipment</h2><div><article><h3>Hire a cat</h3><p>Another pair of paws speeds up paper and ink production. Your 1st, 3rd, and 6th cats bring collectible cards.</p><button className="secondary" disabled={busy || mill.next_cat_cost === null || mill.pulp < mill.next_cat_cost} onClick={() => void action('/games/papermill/hire', 'A cat joined the mill.')}>{mill.next_cat_cost === null ? 'Fully staffed' : `Hire · ${mill.next_cat_cost} pulp`}</button></article><article><h3>Press roller</h3><p>Make paper faster.</p><button className="secondary" disabled={busy || mill.roller || mill.pulp < 15} onClick={() => void action('/games/papermill/upgrades/roller', 'Roller installed.')}>{mill.roller ? 'Installed' : 'Install · 15 pulp'}</button></article><article><h3>Ink vat</h3><p>Make ink faster.</p><button className="secondary" disabled={busy || mill.ink_vat || mill.pulp < 20} onClick={() => void action('/games/papermill/upgrades/ink_vat', 'Ink vat installed.')}>{mill.ink_vat ? 'Installed' : 'Install · 20 pulp'}</button></article></div></div></>}
  </section>
}
