import { useEffect, useState, type FormEvent } from 'react'
import { api } from './api'
import { Card } from './Card'
import type { CardCopy, Deck, State } from './types'

function counts(values: Record<string, number>) {
  const entries = Object.entries(values).sort(([a], [b]) => a.localeCompare(b))
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(' · ') : 'None yet'
}

export function DecksPage({ state, onOpenCard, onChanged, onPrintDeck }: {
  state: State
  onOpenCard: (card: CardCopy) => void
  onChanged: () => Promise<void>
  onPrintDeck: (deck: Deck) => void
}) {
  const [decks, setDecks] = useState<Deck[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [title, setTitle] = useState('')
  const [theme, setTheme] = useState('storybook')
  const [editing, setEditing] = useState<string | null>(null)
  const themes = state.catalog.filter(part => part.kind === 'theme')
  const themeNames = new Map(themes.map(part => [part.id, part.name]))

  async function load() {
    try { setDecks(await api<Deck[]>('/decks')); setError('') }
    catch (reason) { setError((reason as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [state.library])

  async function change(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await work(); await onChanged(); await load(); setNotice(success) }
    catch (reason) { setError((reason as Error).message) }
    finally { setBusy(false) }
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    void change(async () => {
      await api(editing ? `/decks/${editing}` : '/decks', editing ? 'PUT' : 'POST', { title: title.trim(), theme })
      setEditing(null); setTitle(''); setTheme('storybook')
    }, editing ? 'Deck updated.' : 'Custom deck added.')
  }
  function edit(deck: Deck) { setEditing(deck.id); setTitle(deck.title); setTheme(deck.theme); document.getElementById('custom-deck-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  const curated = decks.filter(deck => deck.kind === 'curated')
  const custom = decks.filter(deck => deck.kind === 'custom')
  const completed = curated.filter(deck => deck.filled === deck.total).length

  return <section className="page decks-page">
    <div className="page-intro row-intro"><div><p className="eyebrow">THE DECK CABINET</p><h1>Build a little <em>legend.</em></h1><p>Gather three cards for each deck. A card can appear in several decks, and claiming a prize keeps every copy in your box.</p></div><div className="collection-count"><strong>{completed}<span> / {curated.length}</span></strong><span>CURATED DECKS COMPLETE</span></div></div>
    {error && <p className="deck-message deck-error" role="alert">{error}</p>}
    {notice && <p className="deck-message" role="status">{notice}</p>}
    {loading ? <p className="deck-loading">Opening the deck cabinet…</p> : <>
      <div className="deck-section-title"><div><p className="eyebrow">THE ARCHIVE'S CHALLENGES</p><h2>Curated decks</h2></div><span>COMPLETE ONCE · CLAIM ONCE</span></div>
      <div className="deck-shelf">{curated.map(deck => <DeckBox key={deck.id} deck={deck} themeName={themeNames.get(deck.theme) || deck.theme} busy={busy} onOpenCard={onOpenCard} onPrint={() => onPrintDeck(deck)} onClaim={() => void change(() => api(`/decks/${deck.id}/claim`, 'POST'), `${deck.title} reward collected.`)} />)}</div>
      <div className="deck-section-title"><div><p className="eyebrow">YOUR OWN FOLIOS</p><h2>Custom decks</h2></div><span>ONE LAND · ONE MONSTER · ONE SPELL</span></div>
      <form id="custom-deck-form" className="deck-create" onSubmit={submit}><div><h3>{editing ? 'Edit your deck' : 'Start a custom deck'}</h3><p>Choose an art direction. Any three owned cards of that theme—one of each type—complete your deck.</p></div><label>Deck title<input required maxLength={64} value={title} onChange={event => setTitle(event.target.value)} placeholder="The Moonlit Menagerie" /></label><label>Theme<select value={theme} onChange={event => setTheme(event.target.value)}>{themes.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}</select></label><div className="deck-form-actions"><button className="primary" type="submit" disabled={busy || !title.trim() || custom.length >= 20 && !editing}>{editing ? 'Save deck ↗' : 'Create deck ↗'}</button>{editing && <button className="secondary" type="button" onClick={() => { setEditing(null); setTitle(''); setTheme('storybook') }}>Cancel</button>}</div></form>
      {custom.length ? <div className="deck-shelf">{custom.map(deck => <DeckBox key={deck.id} deck={deck} themeName={themeNames.get(deck.theme) || deck.theme} busy={busy} onOpenCard={onOpenCard} onPrint={() => onPrintDeck(deck)} onEdit={() => edit(deck)} onDelete={() => { if (window.confirm(`Delete ${deck.title}?`)) void change(() => api(`/decks/${deck.id}`, 'DELETE'), 'Custom deck deleted.') }} />)}</div> : <p className="deck-empty">Your custom shelf is waiting for its first deck.</p>}
    </>}
  </section>
}

function DeckBox({ deck, themeName, busy, onOpenCard, onPrint, onClaim, onEdit, onDelete }: {
  deck: Deck; themeName: string; busy: boolean; onOpenCard: (card: CardCopy) => void
  onPrint: () => void; onClaim?: () => void; onEdit?: () => void; onDelete?: () => void
}) {
  const complete = deck.filled === deck.total
  const reward = deck.reward
  return <details className={`deck-box deck-${deck.accent}`} open={deck.kind === 'curated' && deck.id === 'pressroom'}>
    <summary className="deck-cover"><span className="deck-cover-art" aria-hidden="true">{deck.slots.find(slot => slot.card)?.card ? <img src={deck.slots.find(slot => slot.card)!.card!.art_path} alt="" /> : '✧'}</span><span className="deck-cover-copy"><small>{deck.kind === 'curated' ? 'ARCHIVE FOLIO' : 'YOUR FOLIO'} · {themeName.toUpperCase()}</small><strong>{deck.title}</strong><span>{deck.description}</span></span><span className="deck-cover-progress"><b>{deck.filled} / {deck.total}</b><small>{complete ? deck.claimed ? 'REWARD CLAIMED' : 'COMPLETE' : 'COLLECTING'}</small><progress value={deck.filled} max={deck.total} aria-label={`${deck.title} completion`} /></span></summary>
    <div className="deck-interior"><div className="deck-slots">{deck.slots.map(slot => <div className={`deck-slot ${slot.card ? 'filled' : 'missing'}`} key={slot.key}>{slot.card ? <Card card={slot.card} onClick={() => onOpenCard(slot.card!)} /> : <div className="deck-missing-card"><span>◇</span><small>MISSING CARD</small></div>}<div className="deck-slot-label"><strong>{slot.label}</strong><small>{slot.card ? `${slot.card.finish_id} · grade ${slot.card.grade}` : 'Still to find'}</small></div></div>)}</div>
      <div className="deck-print-action"><span>{complete ? 'Ready for a three-card photo or sticker sheet.' : `${deck.filled} owned ${deck.filled === 1 ? 'card' : 'cards'} ready for a sheet.`}</span><button className="secondary" disabled={!deck.filled} onClick={onPrint}>{complete ? 'Print this deck ↗' : 'Print owned cards ↗'}</button></div>
      <div className="deck-detail-row"><div className="deck-analysis"><h3>Deck analysis</h3><div><span>Types</span><strong>{counts(deck.analysis.type_counts)}</strong></div><div><span>Finishes</span><strong>{counts(deck.analysis.finish_counts)}</strong></div><div><span>Average grade</span><strong>{deck.analysis.average_grade || '—'}</strong></div><div><span>Total rule power</span><strong>{deck.analysis.total_power}</strong></div><div><span>Rules</span><strong>{counts(deck.analysis.rule_counts)}</strong></div><div><span>Protected copies</span><strong>{deck.analysis.protected} / {deck.filled}</strong></div></div>
        {reward ? <div className="deck-reward"><small>COMPLETION REWARD</small><h3>{reward.card ? `${reward.card.name} · rare ${reward.card.finish_id}` : 'Materials for the press'}</h3>{reward.card?.slab_grade && <p>Already slabbed · grade {reward.card.slab_grade}</p>}<p>{Object.entries(reward.resources).map(([kind, amount]) => `${amount} ${kind}`).join(' · ') || 'A special archive edition'}</p><button className="primary" disabled={busy || !complete || deck.claimed} onClick={onClaim}>{deck.claimed ? 'Reward claimed' : complete ? 'Claim reward ↗' : 'Complete deck to claim'}</button></div> : <div className="deck-reward deck-custom-note"><small>YOUR COLLECTION</small><h3>A theme of your own.</h3><p>Custom decks track your cards and strategy. Specific required cards arrive in a later version.</p><div className="deck-custom-actions"><button className="secondary" onClick={onEdit}>Edit deck</button><button className="secondary" onClick={onDelete} disabled={busy}>Delete</button></div></div>}</div>
    </div>
  </details>
}
