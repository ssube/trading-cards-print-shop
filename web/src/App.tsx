import { useEffect, useState } from 'react'
import { api, setCsrf } from './api'
import { Card } from './Card'
import { CardLibrary } from './CardLibrary'
import { CollectionProgress } from './CollectionProgress'
import { FinishGallery } from './FinishGallery'
import { ProgressPage } from './ProgressPage'
import { PhysicalPrint, type PrintPreset } from './PhysicalPrint'
import { GamesHub } from './GamesHub'
import { DecksPage } from './DecksPage'
import { StarterWelcome } from './StarterWelcome'
import { isOfflineDemo, resetOfflineDemo } from './offline-game'
import type { CardCopy, CollectionProgress as Progress, Deck, Listing, NpcOffer, StarterDeck, State, User } from './types'

type Tab = 'workshop' | 'games' | 'print' | 'finishes' | 'library' | 'decks' | 'progress' | 'commissions' | 'trading' | 'admin'
const passes = ['Preparing plate', 'Cyan pass', 'Magenta pass', 'Yellow pass', 'Black pass', 'Foil press', 'Final reveal']
const emptyState: State = { resources: {}, library: [], catalog: [], commissions: [], npcs: [], collection_progress: { rules: { collected: 0, total: 0, percent: 0 }, foils: { collected: 0, total: 0, percent: 0 }, borders: { collected: 0, total: 0, percent: 0 }, backs: { collected: 0, total: 0, percent: 0 }, cards: { collected: 0, total: 0, percent: 0 } }, generation_count: 0, generation_limit: 5, allowance_claimed: false }

function PrintAnimation({ stage, card }: { stage: number; card: CardCopy }) {
  const finish = card.finish_id
  const sequence = passes.filter(p => finish !== 'standard' || p !== 'Foil press')
  return <div className="print-stage" role="status" aria-live="polite">
    <div className="printer-machine"><div className="printer-top"><span>THE MOONLIT PRESS</span><i /></div>
      <div className="printer-slot"><div className={`print-sheet pass-${stage}`}>
        <Card card={card} />
        <div className="ink-layer ink-c" /><div className="ink-layer ink-m" /><div className="ink-layer ink-y" /><div className="ink-layer ink-k" />
        {finish !== 'standard' && <div className="ink-layer ink-foil" />}
      </div></div><div className="printer-base"><span>CMYK / {finish.toUpperCase()}</span><div className="printer-lights"><b /><b /><b /></div></div>
    </div>
    <div className="pass-timeline">{sequence.map((label, index) => <div key={label} className={index <= stage ? 'passed' : ''}><span>{index + 1}</span>{label}</div>)}</div>
    <p className="print-caption">{sequence[Math.min(stage, sequence.length - 1)]} <span className="ellipsis">···</span></p>
  </div>
}

function PreparingAnimation() {
  return <div className="preparing-stage" role="status" aria-live="polite"><div className="preparing-orbit"><span>✦</span><i /><b /></div><h2>Finding its story.</h2><p>The artwork, name, and flavor are being composed before the press begins.</p></div>
}

function App() {
  const offline = isOfflineDemo()
  const [user, setUser] = useState<User | null>(null)
  const [state, setState] = useState<State>(emptyState)
  const [market, setMarket] = useState<Listing[]>([])
  const [tab, setTab] = useState<Tab>('workshop')
  const [printPreset, setPrintPreset] = useState<(PrintPreset & { id: string }) | null>(null)
  const [selected, setSelected] = useState<CardCopy | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [starterDecks, setStarterDecks] = useState<StarterDeck[]>([])
  const [starterDeckId, setStarterDeckId] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [titleHint, setTitleHint] = useState('')
  const [recipe, setRecipe] = useState({ type_id: 'monster', trigger: 'arrival', effect: 'draw', condition: '', theme_id: 'storybook', finish_id: 'standard', border_id: 'classic', back_id: 'archive' })
  const [printing, setPrinting] = useState<number | null>(null)
  const [printingCard, setPrintingCard] = useState<CardCopy | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [wish, setWish] = useState('')
  const [offerCard, setOfferCard] = useState('')
  const [adminInfo, setAdminInfo] = useState<{ users: { id: number; username: string; collection_progress: Progress }[]; designs: { id: string; name: string }[]; audit: { id: number; action: string; target: string; reason: string }[] } | null>(null)
  const [adminAction, setAdminAction] = useState('grant-resource')
  const [adminPayload, setAdminPayload] = useState('{"user_id":1,"kind":"paper","amount":5}')
  const [adminReason, setAdminReason] = useState('Playtest adjustment')

  async function refresh() {
    const [data, listings] = await Promise.all([api<State>('/state'), api<Listing[]>('/market')])
    setState(data); setMarket(listings)
    if (selected) setSelected(data.library.find(c => c.id === selected.id) || selected)
  }
  useEffect(() => {
    api<User>('/auth/me').then(u => { setUser(u); setCsrf(u.csrf); return Promise.all([api<State>('/state'), api<Listing[]>('/market')]) })
      .then(([data, listings]) => { setState(data); setMarket(listings) }).catch(error => { if (offline && (error as Error).message !== 'Start the offline demo with a starter deck first.') setMessage((error as Error).message) }).finally(() => setLoading(false))
  }, [])
  useEffect(() => { api<StarterDeck[]>('/starter-decks').then(setStarterDecks).catch(error => setMessage((error as Error).message)) }, [])
  useEffect(() => {
    const deck = starterDecks.find(item => item.id === user?.starter_deck_id)
    const featured = deck?.cards.find(card => card.id === deck.featured)
    if (featured) setRecipe({ type_id: featured.type_id, trigger: featured.rule_ids[0], effect: featured.rule_ids[1],
      condition: featured.rule_ids[2] || '', theme_id: featured.theme_id, finish_id: 'standard',
      border_id: featured.border_id, back_id: featured.back_id })
  }, [user?.id, user?.starter_deck_id, starterDecks])
  async function run(work: () => Promise<unknown>, success: string) {
    try { await work(); await refresh(); setMessage(success) } catch (error) { setMessage((error as Error).message) }
  }
  async function authenticate() {
    if (authMode === 'register' && !starterDeckId) { setMessage('Choose a starter deck to begin.'); return }
    setAuthBusy(true)
    try {
      const u = await api<User>(offline ? '/auth/register' : `/auth/${authMode}`, 'POST', offline ? { starter_deck_id: starterDeckId } : authMode === 'register' ? { username, password, starter_deck_id: starterDeckId } : { username, password })
      setUser(u); setCsrf(u.csrf); await refresh(); setMessage(`Welcome ${u.username}`)
    } catch (error) { setMessage((error as Error).message) }
    finally { setAuthBusy(false) }
  }
  async function printCard() {
    const rules = [recipe.trigger, recipe.condition, recipe.effect].filter(Boolean)
    const finish = recipe.finish_id
    setPreparing(true)
    let timer: number | undefined
    try {
      const job = await api<{ id: string; discovery_name?: string }>('/prints', 'POST', { type_id: recipe.type_id, rule_ids: rules, theme_id: recipe.theme_id, finish_id: finish, border_id: recipe.border_id, back_id: recipe.back_id, hint: titleHint.trim() }, { 'Idempotency-Key': crypto.randomUUID() })
      let result: { status: string; error?: string; copy_id?: string }
      do { await new Promise(resolve => setTimeout(resolve, 900)); result = await api(`/jobs/${job.id}`) } while (result.status === 'pending' || result.status === 'working')
      if (result.status === 'failed') throw new Error(result.error || 'Printing failed')
      if (!result.copy_id) throw new Error('Print completed without a card')
      const finishedCard = await api<CardCopy>(`/copies/${result.copy_id}`)
      await new Promise<void>((resolve, reject) => {
        const art = new Image()
        art.onload = () => resolve()
        art.onerror = () => reject(new Error('Card artwork could not be loaded'))
        art.src = finishedCard.art_path
        if (art.complete && art.naturalWidth) resolve()
      })
      setPrintingCard(finishedCard)
      setPreparing(false)
      setPrinting(0)
      const stages = finish === 'standard' ? 6 : 7
      timer = window.setInterval(() => setPrinting(s => s === null ? null : Math.min(s + 1, stages - 1)), 1050)
      await new Promise(resolve => setTimeout(resolve, stages * 1050))
      await refresh()
      setSelected(finishedCard)
      setMessage(job.discovery_name ? `A new card and the archive sample ${job.discovery_name} are ready in your library. Study the sample to learn its parts.` : 'A new card is ready for your library.')
    } catch (error) { setMessage((error as Error).message) }
    finally { if (timer) window.clearInterval(timer); setPreparing(false); setPrinting(null); setPrintingCard(null) }
  }
  const learned = (kind: string) => state.catalog.filter(p => p.kind === kind && p.learned)
  const finishCosts = JSON.parse(state.catalog.find(p => p.id === recipe.finish_id)?.cost_json || '{}') as Record<string, number>
  const cost: Record<string, number> = { paper: 1, ink: 1 + [recipe.trigger, recipe.condition, recipe.effect].filter(Boolean).length, foil: 0 }
  for (const [kind, amount] of Object.entries(finishCosts)) cost[kind] = (cost[kind] || 0) + amount
  const canPrint = Object.entries(cost).every(([kind, amount]) => (state.resources[kind] || 0) >= amount) && state.generation_count < state.generation_limit
  const nav: { key: Tab; label: string; icon: string; disabled?: boolean }[] = [
    { key: 'workshop', label: 'The Press', icon: '✧' }, { key: 'library', label: 'Card Library', icon: '▤' }, { key: 'decks', label: 'Decks', icon: '▥' },
    { key: 'print', label: 'Print Sheets', icon: '▦' },
    { key: 'games', label: 'Games', icon: '♧' },
    { key: 'progress', label: 'Progress', icon: '◉' },
    { key: 'finishes', label: 'Finish Gallery', icon: '◈' },
    { key: 'commissions', label: 'Commissions', icon: '✦', disabled: offline },
    { key: 'trading', label: 'Trading Hall', icon: '⇄', disabled: offline },
    ...(user?.is_admin ? [{ key: 'admin' as Tab, label: 'Admin', icon: '⚙' }] : []),
  ]
  const selectedGrade = selected?.slab_grade !== null ? `${selected?.slab_grade} ${selected?.grade_name}` : selected?.estimated_grade
  useEffect(() => {
    if (!selected) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selected])

  if (loading) return <div className="loading-screen">Warming the press <span>✦</span></div>
  if (!user) return <StarterWelcome mode={authMode} setMode={setAuthMode} decks={starterDecks} selectedDeck={starterDeckId} setSelectedDeck={setStarterDeckId} username={username} setUsername={setUsername} password={password} setPassword={setPassword} message={message} busy={authBusy} onSubmit={authenticate} offline={offline} onTryDemo={() => { window.location.search = '?demo=1' }} onResetDemo={() => { if (window.confirm('Reset this browser’s offline collection? This cannot be undone.')) { try { resetOfflineDemo(); setMessage('Offline collection cleared. Choose a starter deck to begin again.') } catch (error) { setMessage((error as Error).message) } } }} />

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-seal">TC<span>:</span>PS</div><div><strong>Trading Cards:</strong><small>Print Shop</small></div></div>{offline && <div className="offline-sidebar-label">◌ OFFLINE DEMO</div>}<div className="sidebar-caption">COLLECTOR'S WORKSHOP</div><nav>{nav.map(item => <button key={item.key} type="button" className={tab === item.key ? 'active' : ''} disabled={item.disabled} title={item.disabled ? 'Online only' : undefined} onClick={() => { if (item.disabled) return; if (item.key === 'print') setPrintPreset(null); setTab(item.key); setMessage(''); if (item.key === 'admin') api<typeof adminInfo>('/admin/overview').then(setAdminInfo).catch(e => setMessage(e.message)) }}><span>{item.icon}</span>{item.label}{item.disabled && <small className="nav-unavailable">ONLINE ONLY</small>}</button>)}</nav><div className="sidebar-bottom"><div className="little-star">✦</div><p>“A good card is never finished. Only printed.”</p><div className="profile"><span className="avatar">{user.username[0].toUpperCase()}</span><div><strong>{user.username}</strong><small>{offline ? 'Saved in this browser' : `Collector #${String(user.id).padStart(3, '0')} · ${starterDecks.find(deck => deck.id === user.starter_deck_id)?.name || 'Founding edition'}`}</small></div>{!offline && <button title="Sign out" onClick={() => run(async () => { await api('/auth/logout', 'POST'); setUser(null) }, '')}>↪</button>}</div></div></aside>
    <main className="main-content"><header className="topbar"><span className="breadcrumb">THE ARCHIVE <span>/</span> {nav.find(n => n.key === tab)?.label.toUpperCase()}</span><div className="topbar-right">{!state.allowance_claimed && <button type="button" className="topbar-allowance" onClick={() => run(() => api('/allowance/claim', 'POST'), 'Daily paper and ink collected.')}>✦ Collect daily supplies</button>}<div className="resource-pill">▤ <strong>{state.resources.paper || 0}</strong> paper</div><div className="resource-pill">◉ <strong>{state.resources.ink || 0}</strong> ink</div><div className="resource-pill foil-pill">✧ <strong>{state.resources.foil || 0}</strong> foil</div><div className="resource-pill">◇ <strong>{state.resources.sleeve || 0}</strong> sleeves</div></div></header>
    {offline && <div className="offline-banner" role="note"><strong>◌ OFFLINE DEMO</strong><span>Your collection is saved in this browser. Progress is not shared with online players or other devices.</span></div>}
    {message && <div className="toast" role="status"><span>✦</span>{message}<button onClick={() => setMessage('')}>×</button></div>}
    {tab !== 'progress' && <CollectionProgress progress={state.collection_progress} />}
    {tab === 'progress' && <ProgressPage state={state} onOpenCard={setSelected} onNavigate={setTab} offline={offline} />}
    {tab === 'decks' && <DecksPage state={state} onOpenCard={setSelected} onChanged={refresh} onPrintDeck={(deck: Deck) => { setPrintPreset({ id: crypto.randomUUID(), title: deck.title, copyIds: deck.slots.flatMap(slot => slot.card ? [slot.card.id] : []) }); setTab('print') }} />}
    {tab === 'workshop' && <section className="page workshop-page"><div className="page-intro"><p className="eyebrow">THE HEART OF THE WORKSHOP</p><h1>Make something <em>remarkable.</em></h1><p>Choose what you've learned. The press will give it a name, a face, and a life of its own.</p></div><div className="workshop-grid"><div className="builder-panel"><div className="panel-heading"><span className="panel-icon">✧</span><div><p className="eyebrow">NEW EDITION</p><h2>Compose a card</h2></div><span className="step-marker">01 / 03</span></div><div className="builder-fields"><label>Card type<select value={recipe.type_id} onChange={e => setRecipe({ ...recipe, type_id: e.target.value })}>{learned('type').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="field-pair"><label>Trigger<select value={recipe.trigger} onChange={e => setRecipe({ ...recipe, trigger: e.target.value })}>{learned('rule').filter(p => p.slot === 'trigger').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Effect<select value={recipe.effect} onChange={e => setRecipe({ ...recipe, effect: e.target.value })}>{learned('rule').filter(p => p.slot === 'effect').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><label>Condition <span className="optional">OPTIONAL</span><select value={recipe.condition} onChange={e => setRecipe({ ...recipe, condition: e.target.value })}><option value="">No extra condition</option>{learned('rule').filter(p => p.slot === 'condition').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><div className="field-pair"><label>Art direction<select value={recipe.theme_id} onChange={e => setRecipe({ ...recipe, theme_id: e.target.value })}>{learned('theme').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Finish<select value={recipe.finish_id} onChange={e => setRecipe({ ...recipe, finish_id: e.target.value })}>{learned('finish').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><div className="field-pair"><label>Border<select value={recipe.border_id} onChange={e => setRecipe({ ...recipe, border_id: e.target.value })}>{learned('border').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Card back<select value={recipe.back_id} onChange={e => setRecipe({ ...recipe, back_id: e.target.value })}>{learned('back').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div><label>Title or theme hint <span className="optional">OPTIONAL · {titleHint.length}/254</span><input type="text" value={titleHint} maxLength={254} placeholder="A fox in a moonlit bookshop" onChange={e => setTitleHint(e.target.value)} /></label></div><div className="cost-strip"><div><small>PRINT COST</small><div><span>▤ {cost.paper} paper</span><span>◉ {cost.ink} ink</span>{cost.foil > 0 && <span>✧ {cost.foil} foil</span>}</div></div><small>{state.generation_count} / {state.generation_limit} new editions today</small></div><button className="primary print-button" disabled={!canPrint || preparing || printing !== null} onClick={printCard}>{preparing ? 'Composing your card…' : printing !== null ? 'Printing your card…' : 'Pull the lever & print'} <span>↗</span></button></div><div className="preview-panel"><p className="eyebrow">THE PRESS ROOM</p>{preparing ? <PreparingAnimation /> : printing !== null && printingCard ? <PrintAnimation stage={printing} card={printingCard} /> : <><div className="preview-art"><div className="preview-card"><span className="preview-sun">✧</span><span className="preview-title">Your next<br />masterpiece</span><span className="preview-line" /></div></div><p className="preview-copy">A blank card is a beautiful possibility.<br />What will yours become?</p><div className="preview-bottom">✦ &nbsp; ORIGINALS ARE MADE HERE &nbsp; ✦</div></>}</div></div><div className="bottom-note"><span>✦</span> {offline ? 'Each new design reveals an archive sample. Study it to learn more rules, finishes, and art directions.' : 'Discover more rules, finishes, and art directions by studying cards you receive in trade.'}</div></section>}
    {tab === 'finishes' && <FinishGallery catalog={state.catalog} library={state.library} onUseFinish={finishId => { setRecipe(current => ({ ...current, finish_id: finishId })); setTab('workshop') }} offline={offline} />}
    {tab === 'library' && <CardLibrary cards={state.library} catalog={state.catalog} cardProgress={state.collection_progress.cards} onOpenCard={setSelected} onVisitPress={() => setTab('workshop')} />}
    {tab === 'print' && <PhysicalPrint key={printPreset?.id || 'manual'} cards={state.library} paper={state.resources.paper || 0} onCharged={refresh} preset={printPreset} />}
    {tab === 'games' && <GamesHub state={state} onChanged={refresh} offline={offline} />}
    {tab === 'commissions' && <section className="page"><div className="page-intro"><p className="eyebrow">REQUESTS FROM THE ARCHIVE</p><h1>Good work, <em>well rewarded.</em></h1><p>Meet a brief, turn in a copy, and keep the press running.</p></div><div className="section-heading"><h2>Today's commissions</h2><span>REFRESHES AT 00:00 UTC</span></div><div className="quest-grid">{state.commissions.map((brief, i) => <div className="quest-card" key={brief.id}><div className="quest-number">0{i+1}</div><div className="quest-top"><span className="quest-symbol">{['✧','⌖','◇','▣'][i % 4]}</span><span className="quest-tag">{brief.repeatable ? `REPEATABLE · ${brief.claimed}/3` : brief.claimed ? 'COMPLETE TODAY' : 'DAILY BRIEF'}</span></div><h3>{brief.title}</h3><p>{brief.description}</p><div className="quest-tags">{Object.entries(brief.requirement).map(([k,v]) => <span key={k}>{k.replace('_',' ')}: {String(v)}</span>)}</div><div className="quest-reward"><small>REWARD</small><div>{Object.entries(brief.reward).map(([k,v]) => <span key={k}>{v} {k}</span>)}</div></div><select id={`claim-${brief.id}`} aria-label={`Card for ${brief.title}`}><option value="">Select a copy</option>{state.library.map(c => <option key={c.id} value={c.id}>{c.name} · {c.estimated_grade}</option>)}</select><button className="secondary full" disabled={brief.claimed >= (brief.repeatable ? 3 : 1)} onClick={() => { const id = (document.getElementById(`claim-${brief.id}`) as HTMLSelectElement).value; run(() => api(`/commissions/${brief.id}/claim`, 'POST', { copy_id: id }), 'Commission complete. Materials added.') }}>Turn in copy ↗</button></div>)}</div><div className="section-heading lower"><h2>The grading desk</h2><span>THE ARCHIVIST IS IN</span></div><div className="grading-banner"><span>10</span><div><h3>Every detail counts.</h3><p>Bring a copy to the Archivist for a certified grade and protective slab. It costs one ink and one sleeve. Some collectors ask specifically for slabbed cards.</p></div><button className="secondary" onClick={() => setTab('library')}>Open your library ↗</button></div></section>}
    {tab === 'trading' && <section className="page"><div className="page-intro"><p className="eyebrow">THE EXCHANGE FLOOR</p><h1>Trade to <em>discover.</em></h1><p>New cards bring new knowledge. Your next idea might be in someone else's box.</p></div><div className="section-heading"><h2>Collectors in residence</h2><span>ONE TRADE PER NPC DAILY</span></div><div className="npc-grid">{state.npcs.map((offer: NpcOffer) => <div className="npc-card" key={offer.id}><div className="npc-avatar">{offer.npc_name[0]}</div><div><small>{offer.npc_name.toUpperCase()}</small><h3>{offer.title}</h3><p>Wants {JSON.stringify(offer.requirement).replace(/[{}"]+/g,'').replace(':', ': ')}</p><strong>Offers {JSON.stringify(offer.reward).replace(/[{}"]+/g,'').replace(':', ': ')}</strong></div>{'type' in offer.requirement && <select id={`npc-${offer.id}`} aria-label={`Card for ${offer.npc_name}`}><option value="">Choose card</option>{state.library.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}<button className="secondary" disabled={offer.claimed} onClick={() => run(() => api(`/npcs/${offer.id}/trade`, 'POST', { copy_id: (document.getElementById(`npc-${offer.id}`) as HTMLSelectElement | null)?.value || null }), 'Trade complete.')}>{offer.claimed ? 'Traded today' : 'Trade ↗'}</button></div>)}</div><div className="section-heading lower"><h2>Player marketplace</h2><span>CARDS FOR CARDS · NO CURRENCY</span></div><div className="market-layout"><div className="market-list">{market.length ? market.map(listing => <div className="market-row" key={listing.id}><div className="market-mini"><Card card={listing.card} /></div><div className="market-detail"><small>LISTED BY {listing.seller.toUpperCase()}</small><h3>{listing.card.name}</h3><p>Looking for: {listing.wish}</p><span>{listing.card.finish_id} · {listing.card.slab_grade !== null ? `Graded ${listing.card.slab_grade}` : listing.card.estimated_grade}</span>{listing.seller_id === user.id && listing.offers.map(o => <div className="offer-line" key={o.id}>{o.cards.map(c => c.name).join(', ')} <button onClick={() => run(() => api(`/market/offers/${o.id}/accept`, 'POST'), 'Trade accepted.')}>Accept</button></div>)}</div>{listing.seller_id === user.id ? <button className="secondary" onClick={() => run(() => api(`/market/listings/${listing.id}/cancel`, 'POST'), 'Listing cancelled.')}>Cancel</button> : <div className="offer-control"><select value={offerCard} onChange={e => setOfferCard(e.target.value)}><option value="">Offer a copy</option>{state.library.filter(c => !c.listed).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="secondary" onClick={() => run(() => api(`/market/listings/${listing.id}/offers`, 'POST', { copy_ids: [offerCard] }), 'Offer sent.')}>Offer ↗</button></div>}</div>) : <div className="empty-market">No listings yet. Be the first to offer a card.</div>}</div><div className="listing-panel"><span className="panel-icon">⇄</span><h3>Offer an edition</h3><p>Put one of your copies in the trading hall and say what would tempt you.</p><select id="listing-copy"><option value="">Choose your card</option>{state.library.filter(c => !c.listed).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><textarea placeholder="I’m looking for a Spell, or a celestial theme…" value={wish} onChange={e => setWish(e.target.value)} /><button className="primary full" onClick={() => run(() => api('/market/listings', 'POST', { copy_id: (document.getElementById('listing-copy') as HTMLSelectElement).value, wish }), 'Your card is now listed.')}>Create listing ↗</button></div></div></section>}
    {tab === 'admin' && user.is_admin === 1 && <section className="page"><div className="page-intro"><p className="eyebrow">OPERATOR'S DESK</p><h1>The <em>admin ledger.</em></h1><p>Every change is recorded with an actor and reason. Use care with the collection.</p></div><div className="admin-grid"><div className="builder-panel"><div className="panel-heading"><span className="panel-icon">⚙</span><div><p className="eyebrow">ADMIN ACTION</p><h2>Make a change</h2></div></div><label>Action<select value={adminAction} onChange={e => setAdminAction(e.target.value)}>{['create-player','grant-resource','grant-part','create-design','update-design','print-copy','give-copy','set-grade','set-part','set-commission','set-npc-offer'].map(a => <option key={a}>{a}</option>)}</select></label><label>Payload (JSON)<textarea className="code-input" value={adminPayload} onChange={e => setAdminPayload(e.target.value)} /></label><label>Reason<input value={adminReason} onChange={e => setAdminReason(e.target.value)} /></label><button className="primary full" onClick={() => run(async () => { await api('/admin/actions', 'POST', { action: adminAction, payload: JSON.parse(adminPayload), reason: adminReason }); setAdminInfo(await api('/admin/overview')) }, 'Admin action recorded.')}>Run action ↗</button><p className="admin-help">Examples: create-player needs username and password, with optional starter_deck_id (pressroom, starlit, or velvet). grant-resource needs user_id, kind, amount. create-design needs name, optional type_id, rule_ids, theme_id, finish_id, border_id, back_id, flavor. print-copy needs design_id and user_id. Content actions accept IDs and structured requirements.</p></div><div className="admin-lists"><h2>Players</h2>{adminInfo?.users.map(u => <div className="ledger-row player-ledger-row" key={u.id}><span>#{u.id}</span><strong>{u.username}</strong><div className="admin-player-progress"><span>Rules {u.collection_progress.rules.percent}%</span><span>Foils {u.collection_progress.foils.percent}%</span><span>Borders {u.collection_progress.borders.percent}%</span><span>Backs {u.collection_progress.backs.percent}%</span><span>Unique cards {u.collection_progress.cards.percent}%</span></div></div>)}<h2>Recent actions</h2>{adminInfo?.audit.map(a => <div className="ledger-row" key={a.id}><span>{a.action}</span><strong>{a.target}</strong><small>{a.reason}</small></div>)}</div></div></section>}
    </main>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="inspect-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close inspection">×</button><div className="inspect-card"><Card card={selected} large interactive /></div><div className="inspect-info"><p className="eyebrow">INDIVIDUAL COPY · #{selected.id.slice(0, 8).toUpperCase()}</p><h2>{selected.name}</h2><p className="inspect-flavor">“{selected.flavor}”</p><div className="detail-grid"><div><small>CONDITION</small><strong>{selected.condition}%</strong></div><div><small>GRADE</small><strong>{selectedGrade}</strong></div><div><small>FINISH</small><strong>{selected.finish_id}</strong></div><div><small>BORDER</small><strong>{selected.border_id}</strong></div><div><small>BACK</small><strong>{selected.back_id}</strong></div><div><small>CREATOR</small><strong>{selected.creator || 'Archive'}</strong></div></div><div className="condition-meter"><span style={{ width: `${selected.condition}%` }} /></div><p className="defect-note">Print notes: centering {selected.centering_x > 0 ? '+' : ''}{selected.centering_x}x / {selected.centering_y > 0 ? '+' : ''}{selected.centering_y}y · CMYK registration {['C','M','Y','K'].map((c,i) => `${c}${[selected.shift_c,selected.shift_m,selected.shift_y,selected.shift_k][i]}`).join(' ')} · {selected.color_effect}</p><div className="inspect-actions"><button className="secondary" disabled={selected.slab_grade !== null || selected.condition === 0} onClick={() => run(() => api(`/copies/${selected.id}/study`, 'POST'), 'New card parts learned.')}>Study parts</button><button className="secondary" onClick={() => run(() => api(`/copies/${selected.id}/reprint`, 'POST'), 'An exact reprint joins your box.')}>Reprint</button>{selected.slab_grade !== null ? <button className="secondary" onClick={() => run(() => api(`/copies/${selected.id}/crack`, 'POST'), 'Slab removed.')}>Break slab</button> : <><button className="secondary" disabled={!!selected.sleeved} onClick={() => run(() => api(`/copies/${selected.id}/sleeve`, 'POST'), 'Copy sleeved.')}>Sleeve</button><button className="primary" onClick={() => run(() => api(`/copies/${selected.id}/certify`, 'POST'), 'Copy graded and slabbed.')}>Grade & slab ↗</button></>}</div><p className="inspect-hint">Move your pointer over the card to tilt it. Flip or zoom using the controls below it.</p></div></div></div>}
  </div>
}

export default App
