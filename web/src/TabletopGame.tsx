import { useEffect, useState } from 'react'
import { api } from './api'
import type { CardCopy, Deck, State } from './types'

type Practice = { step: number; completed: string[]; next_action: 'place' | 'flip' | 'counter' | null; copy_id: string | null }
type TableCard = { copy_id: string | null; user_id: number; zone: 'hand' | 'table'; face_up: number; x: number; y: number; counters: number; card: CardCopy | null }
type Room = { code: string; revision: number; active_player: number; seat: number; players: { user_id: number; seat: number; username: string }[]; cards: TableCard[]; log: { revision: number; actor: string; description: string }[] }
const lessons = [
  { action: 'place', title: 'The opening hand', detail: 'Choose a card and place it on the practice table.' },
  { action: 'flip', title: 'The secret reveal', detail: 'Flip your practice card to learn face-down play.' },
  { action: 'counter', title: 'The counter keeper', detail: 'Add a counter to your practice card.' },
]

export function TabletopGame({ state, onChanged, offline = false }: { state: State; onChanged: () => Promise<void>; offline?: boolean }) {
  const [practice, setPractice] = useState<Practice | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [decks, setDecks] = useState<Deck[]>([])
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  useEffect(() => { void api<Practice>('/tabletop/practice').then(setPractice).catch(err => setError(err.message)); void api<Deck[]>('/decks').then(setDecks).catch(() => {}) }, [])
  useEffect(() => {
    if (!room?.code || offline) return
    const timer = window.setInterval(() => {
      void api<Room>(`/tabletop/rooms/${room.code}`).then(next => setRoom(current => current?.code === next.code && next.revision >= current.revision ? next : current)).catch(() => {})
    }, 3000)
    return () => window.clearInterval(timer)
  }, [room?.code, offline])
  async function practiceAction() {
    if (!practice?.next_action) return
    setBusy(true); setError(''); setNote('')
    try {
      const result = await api<{ practice: Practice; reward_copy_id: string }>('/tabletop/practice', 'POST', { action: practice.next_action, copy_id: practice.step === 0 ? selected[0] : undefined })
      setPractice(result.practice); setNote('Practice complete. A new card was added to your box.'); await onChanged()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function reopenRoom() {
    if (joinCode.trim().length !== 6) return
    setBusy(true); setError('')
    try { setRoom(await api<Room>(`/tabletop/rooms/${joinCode.trim().toUpperCase()}`)) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function enterRoom(kind: 'create' | 'join') {
    setBusy(true); setError(''); setNote('')
    try {
      const next = kind === 'create'
        ? await api<Room>('/tabletop/rooms', 'POST', { copy_ids: selected })
        : await api<Room>(`/tabletop/rooms/${joinCode.trim().toUpperCase()}/join`, 'POST', { copy_ids: selected })
      setRoom(next); setActiveCard(null)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (!room) return
    setBusy(true); setError('')
    try { setRoom(await api<Room>(`/tabletop/rooms/${room.code}/actions`, 'POST', { expected_revision: room.revision, action, ...data })) }
    catch (err) { setError((err as Error).message); void api<Room>(`/tabletop/rooms/${room.code}`).then(setRoom).catch(() => {}) }
    finally { setBusy(false) }
  }
  const chosen = new Set(selected)
  const myTurn = room && room.players.length === 2 && room.active_player === room.seat
  const me = room?.players.find(player => player.seat === room.seat)
  const mine = room?.cards.filter(card => card.user_id === me?.user_id) || []
  const hand = mine.filter(card => card.zone === 'hand')
  const board = room?.cards.filter(card => card.zone === 'table') || []
  const active = mine.find(card => card.copy_id === activeCard)
  return <section className="page tabletop-page">
    <div className="page-intro"><p className="eyebrow">THE TRADING CARD GAME</p><h1>Wait, you can <em>play?</em></h1><p>A shared table for two people and a deck of house rules. Start with practice, then invite a friend.</p></div>
    {error && <p className="tabletop-message tabletop-error" role="alert">{error}</p>}{note && <p className="tabletop-message" role="status">{note}</p>}
    <section className="tabletop-practice"><div><p className="eyebrow">SOLO PRACTICE</p><h2>{practice?.step === 3 ? 'You know your way around the table.' : lessons[practice?.step || 0].title}</h2><p>{practice?.step === 3 ? 'All three lesson cards are in your collection.' : lessons[practice?.step || 0].detail}</p></div><div className="tabletop-practice-actions"><span>{practice ? `${practice.step} / 3 lessons` : 'Loading lessons…'}</span>{practice?.next_action && <button className="primary" disabled={busy || practice.step === 0 && !selected.length} onClick={() => void practiceAction()}>{practice.next_action === 'place' ? 'Place chosen card' : practice.next_action === 'flip' ? 'Flip practice card' : 'Add a counter'} ↗</button>}</div></section>
    {!room ? <section className="tabletop-lobby"><div className="tabletop-section-title"><h2>Your three-card hand</h2><span>{selected.length} / 3 chosen</span></div><div className="tabletop-deck-shortcuts">{decks.filter(deck => deck.filled === 3).map(deck => <button key={deck.id} className="secondary" onClick={() => setSelected(deck.slots.flatMap(slot => slot.card ? [slot.card.id] : []))}>Use {deck.title}</button>)}</div><div className="tabletop-picker">{state.library.filter(card => !card.listed).map(card => <button key={card.id} className={`tabletop-pick ${chosen.has(card.id) ? 'chosen' : ''}`} onClick={() => setSelected(current => current.includes(card.id) ? current.filter(id => id !== card.id) : current.length < 3 ? [...current, card.id] : current)}><img src={card.art_path} alt="" /><span>{card.name}</span><small>{chosen.has(card.id) ? 'Chosen' : 'Choose'}</small></button>)}</div>{!state.library.length && <p>Print a card before entering the table.</p>}
      <div className="tabletop-room-actions"><div><h3>Open a private room</h3><p>Share its six-character code with one friend.</p><button className="primary" disabled={offline || busy || selected.length !== 3} onClick={() => void enterRoom('create')}>Create room ↗</button></div><div><h3>Join a friend</h3><label>Room code<input value={joinCode} maxLength={6} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" /></label><button className="secondary" disabled={offline || busy || selected.length !== 3 || joinCode.trim().length !== 6} onClick={() => void enterRoom('join')}>Join room ↗</button><button className="secondary" disabled={offline || busy || joinCode.trim().length !== 6} onClick={() => void reopenRoom()}>Reopen my room</button></div></div>{offline && <p className="tabletop-offline">Online rooms are unavailable in the offline demo. Solo practice still awards its deck cards.</p>}</section> : <section className="tabletop-room"><div className="tabletop-room-header"><div><p className="eyebrow">PRIVATE TABLE · {room.code}</p><h2>{room.players.map(player => player.username).join(' vs ')}</h2><p>{room.players.length < 2 ? 'Waiting for your friend to join…' : myTurn ? 'Your turn. Move, reveal, count, or pass.' : 'Your friend’s turn.'}</p></div><div><button className="secondary" onClick={() => { void navigator.clipboard?.writeText(room.code); setNote('Room code copied.') }}>Copy code</button><button className="secondary" onClick={() => { setRoom(null); setActiveCard(null) }}>Leave view</button></div></div>
      <div className="tabletop-board" role="group" aria-label="Card table">{Array.from({ length: 15 }, (_, index) => { const x = index % 5, y = Math.floor(index / 5), cards = board.filter(card => card.x === x && card.y === y); return <button key={index} className="tabletop-cell" disabled={!myTurn || busy} onClick={() => { if (active?.zone === 'hand') void act('place', { copy_id: activeCard, x, y }); else if (active?.zone === 'table') void act('move', { copy_id: activeCard, x, y }) }} aria-label={`Table position ${x + 1}, ${y + 1}`}>{cards.map((card, cardIndex) => <span key={`${card.user_id}-${cardIndex}`} className={`tabletop-board-card ${card.copy_id === activeCard ? 'active' : ''}`} onClick={event => { event.stopPropagation(); if (card.copy_id && card.user_id === me?.user_id) setActiveCard(card.copy_id) }}>{card.card && card.face_up ? <><img src={card.card.art_path} alt="" /><strong>{card.card.name}</strong></> : <strong>TC:PS</strong>}{card.counters > 0 && <b>{card.counters}</b>}</span>)}</button> })}</div>
      <div className="tabletop-hand"><h3>Your hand</h3><div>{hand.map(card => <button key={card.copy_id} className={`tabletop-hand-card ${card.copy_id === activeCard ? 'active' : ''}`} onClick={() => setActiveCard(card.copy_id)}><img src={card.card?.art_path} alt="" /><strong>{card.card?.name}</strong></button>)}</div></div>
      <div className="tabletop-controls"><span>{active?.card?.name || 'Select one of your cards'}</span><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'table'} onClick={() => void act('flip', { copy_id: activeCard })}>Flip</button><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'table'} onClick={() => void act('counter', { copy_id: activeCard, value: 1 })}>+ Counter</button><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'table' || !active.counters} onClick={() => void act('counter', { copy_id: activeCard, value: -1 })}>− Counter</button><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'table'} onClick={() => void act('hand', { copy_id: activeCard })}>To hand</button><button className="primary" disabled={!myTurn || busy} onClick={() => void act('pass')}>Pass turn ↗</button></div><div className="tabletop-log"><h3>Table log</h3><ol>{room.log.map(entry => <li key={entry.revision}><strong>{entry.actor}</strong> {entry.description}</li>)}</ol></div></section>}
  </section>
}
