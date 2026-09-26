import { useRef, type FormEvent } from 'react'
import { aimFoil, resetFoil } from './foil'
import type { StarterDeck } from './types'

export function StarterWelcome({ mode, setMode, decks, selectedDeck, setSelectedDeck, username, setUsername, password, setPassword, message, busy, onSubmit, offline, onTryDemo, onResetDemo }: {
  mode: 'login' | 'register'
  setMode: (mode: 'login' | 'register') => void
  decks: StarterDeck[]
  selectedDeck: string
  setSelectedDeck: (id: string) => void
  username: string
  setUsername: (name: string) => void
  password: string
  setPassword: (password: string) => void
  message: string
  busy: boolean
  onSubmit: () => void
  offline?: boolean
  onTryDemo?: () => void
  onResetDemo?: () => void
}) {
  const registering = offline || mode === 'register'
  const fanRef = useRef<HTMLDivElement>(null)
  const chosen = decks.find(deck => deck.id === selectedDeck)
  const fanCards = chosen?.cards.flatMap(card => Array.from({ length: card.copies }, (_, copy) => ({ ...card, copy }))) || []
  function submit(event: FormEvent) { event.preventDefault(); onSubmit() }
  return <main className={`starter-auth-page ${registering ? '' : 'starter-login-page'}`}>
    <div className="starter-auth-glow" aria-hidden="true" />
    <header className="starter-auth-header"><div className="brand-seal">TC<span>:</span>PS</div><div><strong>Trading Cards:</strong><span>Print Shop</span></div></header>
    <div className="starter-auth-body">
      <div className="starter-auth-intro"><p className="eyebrow">{offline ? 'OFFLINE DEMO · SAVED IN THIS BROWSER' : 'A NEW COLLECTOR ARRIVES'}</p><h1>{registering ? <>Choose your first <em>story.</em></> : <>Welcome back to <em>the press.</em></>}</h1><p>{offline ? 'Choose a six-card starter deck and play without an account. Three extra archive samples await in your library. Your collection stays in this browser and will not be shared.' : registering ? 'Every great collection begins with a deck. Pick a theme and meet the cards that will start your printing journey.' : 'Your collection is waiting where you left it.'}</p></div>
      {!offline && <div className="starter-auth-switch" role="group" aria-label="Account access"><button type="button" className={registering ? 'active' : ''} onClick={() => setMode('register')}>Begin collecting</button><button type="button" className={!registering ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button></div>}
      {registering && <section className="starter-deck-section" aria-labelledby="starter-deck-heading"><div className="starter-section-heading"><div><span>01 / THE STARTER FOLIOS</span><h2 id="starter-deck-heading">Which deck calls to you?</h2></div><small>PRE-GENERATED CARDS · YOUR CHOICE IS PERMANENT</small></div>
        {decks.length ? <div className="starter-deck-grid">{decks.map(deck => {
          const featured = deck.cards.find(card => card.id === deck.featured) || deck.cards[0]
          const selected = selectedDeck === deck.id
          return <button type="button" key={deck.id} className={`starter-deck starter-${deck.accent} ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => setSelectedDeck(deck.id)}>
            <div className="starter-deck-art"><span className="starter-deck-paper" /><img src={featured.art_path} alt={`${featured.name} artwork`} /><span className="starter-deck-choice">{selected ? '✓ SELECTED' : 'CHOOSE DECK ↗'}</span></div>
            <div className="starter-deck-copy"><small>{deck.theme.toUpperCase()}</small><h3>{deck.name}</h3><p>{deck.description}</p><div className="starter-deck-contents">{deck.cards.map(card => <span key={card.id}>{card.copies}× {card.name}</span>)}</div></div>
          </button>
        })}</div> : <p className="starter-deck-loading">The starter folios are being prepared…</p>}
        {chosen && <div className="starter-fan-panel"><div className="starter-fan-heading"><div><span>INSIDE {chosen.name.toUpperCase()}</span><h3>Six cards to begin with</h3></div><div className="starter-fan-arrows"><button type="button" aria-label="Scroll starter cards left" onClick={() => fanRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}>←</button><button type="button" aria-label="Scroll starter cards right" onClick={() => fanRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}>→</button></div></div><div className="starter-fan-track" ref={fanRef} aria-label={`${chosen.name} starter cards`}>
          {fanCards.map((card, index) => <div className={`starter-fan-card finish-${card.finish_id} border-${card.border_id}`} key={`${card.id}-${card.copy}`}
            onPointerMove={event => aimFoil(event.currentTarget, event.clientX, event.clientY)} onPointerLeave={event => resetFoil(event.currentTarget)}><div className="starter-fan-card-heading"><span>{card.type_id.toUpperCase()}</span><span>{card.finish_id.toUpperCase()}</span></div><strong>{card.name}</strong><div className="starter-fan-art"><img src={card.art_path} alt="" /></div><p>{card.flavor}</p><small>COPY {index + 1} OF {fanCards.length}</small><div className="foil-shine" /></div>)}
        </div></div>}
      </section>}
      <form className="starter-auth-form" onSubmit={submit}><div className="starter-form-heading"><span>{offline ? '02 / LOCAL COLLECTION' : registering ? '02 / YOUR COLLECTOR NAME' : 'YOUR WORKSHOP KEY'}</span><h2>{offline ? 'Open your offline workshop' : registering ? 'Open your workshop' : 'Sign in'}</h2></div>{!offline && <><label>Collector name<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required minLength={3} maxLength={24} /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={10} /></label></>}<button className="primary starter-submit" type="submit" disabled={busy || (registering && !selectedDeck)}>{busy ? 'Opening the archive…' : offline ? selectedDeck ? 'Begin offline demo ↗' : 'Choose a deck to begin' : registering ? selectedDeck ? 'Begin with this deck ↗' : 'Choose a deck to begin' : 'Enter the workshop ↗'}</button>{message && <p className="starter-auth-error" role="alert">{message}</p>}</form>
      {!offline && mode === 'register' && onTryDemo && <button className="secondary starter-demo-entry" type="button" onClick={onTryDemo}>Try offline demo · no account needed ↗</button>}
      {offline && message.includes('could not be loaded') && onResetDemo && <button className="secondary starter-demo-entry" type="button" onClick={onResetDemo}>Reset damaged offline collection</button>}
    </div>
    <footer className="starter-auth-footer">✦ &nbsp; EVERY EDITION STARTS SOMEWHERE &nbsp; ✦</footer>
  </main>
}
