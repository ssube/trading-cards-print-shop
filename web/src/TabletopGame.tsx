import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { routeUrl } from './routes'
import type { CardCopy, State } from './types'

type Practice = { step: number; completed: string[]; next_action: 'place' | 'attack' | 'score' | null; copy_id: string | null }
type MatchCard = { id: string; name: string; art_path: string; type_id: string; rule_ids: string[]; rule_text: string[]; guard: number; max_guard: number; zone: 'deck' | 'hand' | 'board' | 'discard'; slot: number | null; attacked: boolean }
type MatchPlayer = { seat: number; user_id: number; username: string; sparks: number; deck_count: number; hand_count: number; discard_count: number; cards: MatchCard[]; peek: { id: string; name: string } | null }
type Reward = { resources: Record<string, number>; copy_id: string | null; design_id?: string }
type Match = { code: string; mode: 'bot' | 'pvp'; format: string; goal: number; turn_limit: number; status: 'waiting' | 'active' | 'finished'; revision: number; active_seat: number; turn: number; actions_left: number; deadline: string | null; winner: number | null; seat: number; players: MatchPlayer[]; lanes: string[]; log: { revision: number; text: string }[]; rewards: Record<string, Reward> }
const laneOf = [0, 0, 1, 2, 2]
const formats = [
  { id: 'starter', title: 'Starter', recommended: 6, goal: 5 },
  { id: 'intermediate', title: 'Intermediate', recommended: 8, goal: 7 },
  { id: 'challenge', title: 'Challenge', recommended: 12, goal: 10 },
]
const lessons = [
  { title: 'The opening hand', detail: 'Choose a card and place it on the practice table.' },
  { title: 'The first attack', detail: 'Monsters attack cards in their lane. A clear lane scores sparks.' },
  { title: 'The spark race', detail: 'Score the format’s spark goal to win; both players can earn resources.' },
]
function secondsLeft(deadline: string | null) { return deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)) : 0 }

export function TabletopGame({ state, onChanged, offline = false, initialCode, onOpenMatch }: { state: State; onChanged: () => Promise<void>; offline?: boolean; initialCode?: string; onOpenMatch: (code: string | null) => void }) {
  const [practice, setPractice] = useState<Practice | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [recent, setRecent] = useState<Match[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [format, setFormat] = useState('starter')
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [inspectedCard, setInspectedCard] = useState<MatchCard | null>(null)
  const [moveMode, setMoveMode] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [rewardSeen, setRewardSeen] = useState<string | null>(null)
  useEffect(() => {
    void api<Practice>('/tabletop/practice').then(setPractice).catch(err => setError(err.message))
    void api<Match[]>('/tcg/matches').then(setRecent).catch(() => {})
    if (initialCode) void api<Match>(`/tcg/matches/${initialCode}`).then(setMatch).catch(err => setError(err.message))
  }, [initialCode])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!match || match.status === 'finished') return
    const timer = window.setInterval(() => {
      void api<Match>(`/tcg/matches/${match.code}`).then(next => setMatch(current => current?.code === next.code && current.revision > next.revision ? current : next)).catch(() => {})
    }, 2000)
    return () => window.clearInterval(timer)
  }, [match?.code, match?.status])
  useEffect(() => {
    if (match?.status === 'finished' && match.rewards[String(match.seat)] && rewardSeen !== match.code) {
      setRewardSeen(match.code)
      void onChanged()
    }
  }, [match?.code, match?.status, match?.seat, match?.rewards, rewardSeen, onChanged])
  async function practiceAction() {
    if (!practice?.next_action) return
    setBusy(true); setError(''); setNote('')
    try {
      const result = await api<{ practice: Practice; reward_copy_id: string }>('/tabletop/practice', 'POST', { action: practice.next_action, copy_id: practice.step === 0 ? selected[0] || state.library[0]?.id : undefined })
      setPractice(result.practice); setNote('Practice complete. A new card was added to your box.'); await onChanged()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function start(bot: boolean) {
    setBusy(true); setError(''); setNote('')
    try {
      const next = await api<Match>('/tcg/matches', 'POST', { copy_ids: selected, format, bot })
      setMatch(next); setActiveCard(null); onOpenMatch(next.code)
      if (!bot) setNote(`Share room code ${next.code} with a friend.`)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function join() {
    setBusy(true); setError('')
    try {
      const next = await api<Match>(`/tcg/matches/${joinCode.trim().toUpperCase()}/join`, 'POST', { copy_ids: selected })
      setMatch(next); setActiveCard(null); onOpenMatch(next.code)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function open(code: string) {
    setBusy(true); setError('')
    try { const next = await api<Match>(`/tcg/matches/${code.trim().toUpperCase()}`); setMatch(next); setActiveCard(null); onOpenMatch(next.code) }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  async function act(action: string, data: Record<string, unknown> = {}) {
    if (!match) return
    setBusy(true); setError('')
    try {
      setMatch(await api<Match>(`/tcg/matches/${match.code}/actions`, 'POST', { expected_revision: match.revision, action, ...data }))
      setMoveMode(false)
    } catch (err) {
      setError((err as Error).message)
      void api<Match>(`/tcg/matches/${match.code}`).then(setMatch).catch(() => {})
    } finally { setBusy(false) }
  }
  const available = useMemo(() => state.library.filter(card => !card.listed), [state.library])
  const my = match?.players[match.seat]
  const opponent = match?.players[1 - match.seat]
  const mine = my?.cards || []
  const active = mine.find(card => card.id === activeCard)
  const myTurn = match?.status === 'active' && match.active_seat === match.seat
  const formatInfo = formats.find(item => item.id === format)!
  const remaining = match ? secondsLeft(match.deadline) : 0
  void now
  function useSuggested() {
    const first = [...available].sort((a, b) => (a.type_id === 'monster' ? -1 : a.type_id === 'spell' ? 1 : 0) - (b.type_id === 'monster' ? -1 : b.type_id === 'spell' ? 1 : 0))
    setSelected(first.slice(0, Math.min(formatInfo.recommended, first.length)).map(card => card.id))
  }
  function toggleCard(card: CardCopy) {
    setSelected(current => current.includes(card.id) ? current.filter(id => id !== card.id) : current.length < 12 ? [...current, card.id] : current)
  }
  function board(player: MatchPlayer, yours: boolean) {
    return <div className={`tcg-board-side ${yours ? 'tcg-own-board' : 'tcg-opponent-board'}`} aria-label={yours ? 'Your board' : "Opponent's board"}>
      {[0, 1, 2, 3, 4].map(slot => {
        const card = player.cards.find(item => item.zone === 'board' && item.slot === slot)
        const canPlace = yours && myTurn && !busy && (moveMode && active?.zone === 'board' || !moveMode && active?.zone === 'hand') && !card
        return <button key={slot} type="button" className={`tcg-slot tcg-lane-${laneOf[slot]} ${card?.id === activeCard ? 'active' : ''} ${canPlace ? 'can-place' : ''}`} onClick={() => {
          if (canPlace && active) void act(moveMode ? 'move' : 'place', { copy_id: active.id, slot })
          else if (card) { setInspectedCard(card); if (yours) setActiveCard(card.id) }
        }} aria-label={`${yours ? 'Your' : 'Opponent'} ${match?.lanes[laneOf[slot]]} slot ${slot + 1}${card ? `: ${card.name}` : ': empty'}`}>
          {card ? <><img src={card.art_path} alt="" /><strong>{card.name}</strong><small>{card.type_id} · {card.guard} guard</small>{card.type_id === 'spell' && <em>STAGED</em>}</> : <span>{match?.lanes[laneOf[slot]]}<small>{canPlace ? 'Place here ↗' : 'Empty'}</small></span>}
        </button>
      })}
    </div>
  }
  return <section className="page tabletop-page tcg-page">
    <div className="page-intro"><p className="eyebrow">THE TRADING CARD GAME</p><h1>Wait, you can <em>play?</em></h1><p>Place cards across three lanes, activate spells, and race to the format’s spark goal.</p></div>
    {error && <p className="tabletop-message tabletop-error" role="alert">{error}</p>}{note && <p className="tabletop-message" role="status">{note}</p>}
    <details className="tcg-practice" open={practice?.step !== 3}><summary>Learn the table · {practice?.step || 0}/3</summary><div className="tabletop-practice"><div><h2>{practice?.step === 3 ? 'You know your way around the table.' : lessons[practice?.step || 0].title}</h2><p>{practice?.step === 3 ? 'All three lesson cards are in your collection.' : lessons[practice?.step || 0].detail}</p></div><div className="tabletop-practice-actions"><button className="secondary" disabled={busy || !practice?.next_action || practice.step === 0 && !available.length} onClick={() => void practiceAction()}>{practice?.next_action ? `${practice.next_action === 'place' ? 'Place' : practice.next_action === 'attack' ? 'Attack' : 'Score'} practice card ↗` : 'Lessons complete'}</button></div></div></details>
    {!match ? <section className="tabletop-lobby"><div className="tcg-format-picker"><h2>Choose a format</h2><div>{formats.map(item => <button key={item.id} className={format === item.id ? 'active' : ''} onClick={() => setFormat(item.id)}><strong>{item.title}</strong><small>{item.recommended} card deck · first to {item.goal} sparks</small></button>)}</div></div>
      <div className="tabletop-section-title"><h2>Your match deck</h2><span>{selected.length} chosen · 6–12 cards</span></div><p>Bring at least one Monster. Friends can use a deck within two cards or 25% of your deck’s printing cost.</p><button className="secondary" onClick={useSuggested}>Choose {formatInfo.recommended} from my box</button><div className="tabletop-picker">{available.map(card => <button key={card.id} className={`tabletop-pick ${selected.includes(card.id) ? 'chosen' : ''}`} onClick={() => toggleCard(card)}><img src={card.art_path} alt="" /><span>{card.name}</span><small>{card.type_id} · {selected.includes(card.id) ? 'Chosen' : 'Choose'}</small></button>)}</div>
      <details className="tcg-howto"><summary>How a match works</summary><p>Draw a card at the start of your turn, then take two actions: place, move, attack, activate a Spell, or pass. Any type can occupy any slot. Monsters attack the first opposing card in their lane; with no blocker, the attack earns sparks. Spells are placed first, then activated and discarded. Printed triggers and effects resolve automatically. The first player to the format’s spark goal wins. Both players earn resources from their sparks in their first three completed matches each day; only a winner can receive a bonus card.</p></details>
      <div className="tcg-rules-strip"><span><strong>Forge</strong> Monsters deal 2 guard damage</span><span><strong>Spotlight</strong> Direct hits score 2 sparks; activated Spells draw 1</span><span><strong>Archive</strong> Lands gain 1 guard when placed</span></div>
      <div className="tabletop-room-actions"><div><h3>Play the pressroom bot</h3><p>A quick match with a deck matching yours. Offline demo matches stay in this browser.</p><button className="primary" disabled={busy || selected.length !== formatInfo.recommended || !selected.some(id => available.find(card => card.id === id)?.type_id === 'monster')} onClick={() => void start(true)}>Play bot ↗</button></div><div><h3>Play a friend</h3><p>{offline ? 'Online rooms are unavailable in the offline demo.' : 'Create a private six-character room or join one.'}</p><button className="secondary" disabled={offline || busy || selected.length !== formatInfo.recommended} onClick={() => void start(false)}>Create room</button><label>Room code<input value={joinCode} maxLength={6} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC123" autoCapitalize="characters" /></label><button className="secondary" disabled={offline || busy || selected.length < 6 || joinCode.trim().length !== 6} onClick={() => void join()}>Join room</button><button className="secondary" disabled={offline || busy || joinCode.trim().length !== 6} onClick={() => void open(joinCode)}>Reopen room</button></div></div>
      {recent.length > 0 && <div className="tcg-recent"><h3>Recent matches</h3>{recent.map(item => <button key={item.code} className="secondary" onClick={() => void open(item.code)}>{item.code} · {item.format} · {item.status}</button>)}</div>}
    </section> : <section className="tabletop-room"><div className="tabletop-room-header"><div><p className="eyebrow">{match.mode === 'bot' ? 'BOT MATCH' : `PRIVATE MATCH · ${match.code}`}</p><h2>{my?.username} vs {opponent?.username || 'Waiting for a friend'}</h2><p>{match.status === 'waiting' ? 'Waiting for a friend to join…' : match.status === 'finished' ? match.winner === null ? 'A draw.' : match.winner === match.seat ? 'You won the match!' : 'Your opponent won.' : myTurn ? `Your turn · ${match.actions_left} actions · ${remaining}s` : `Opponent’s turn · ${remaining}s`}</p></div><div>{match.mode === 'pvp' && <a className="secondary" href={new URL(routeUrl('games', 'match', match.code), window.location.href).href}>Invite link</a>}<button className="secondary" onClick={() => { void navigator.clipboard?.writeText(match.code); setNote(`Room code: ${match.code}`) }}>Copy code</button><button className="secondary" onClick={() => { setMatch(null); setActiveCard(null); setMoveMode(false); onOpenMatch(null); void api<Match[]>('/tcg/matches').then(setRecent).catch(() => {}) }}>Leave view</button></div></div>
      <div className="tcg-score"><span>{my?.username}: <strong>{my?.sparks}</strong> sparks</span><span>First to {match.goal}</span><span>{opponent?.username || 'Opponent'}: <strong>{opponent?.sparks || 0}</strong> sparks</span></div>
      <div className="tcg-board" role="group" aria-label="Three-lane card board"><div className="tcg-lane-headers"><span>FORGE · MONSTERS</span><span>SPOTLIGHT · SPELLS</span><span>ARCHIVE · LANDS</span></div>{opponent && board(opponent, false)}<div className="tcg-board-divider">✦ THE TABLE ✦</div>{my && board(my, true)}</div>
      {inspectedCard && <div className="tcg-inspect"><img src={inspectedCard.art_path} alt="" /><div><p className="eyebrow">PRINTED CARD · {inspectedCard.type_id.toUpperCase()}</p><h3>{inspectedCard.name}</h3><ul>{inspectedCard.rule_text.map((rule, index) => <li key={index}>{rule}</li>)}</ul></div><button className="secondary" onClick={() => setInspectedCard(null)} aria-label="Close card details">×</button></div>}
      <div className="tabletop-hand"><h3>Your hand <small>{my?.hand_count} · deck {my?.deck_count} · discard {my?.discard_count}{my?.peek ? ` · Glimpse: ${my.peek.name}` : ""}</small></h3><div>{mine.filter(card => card.zone === 'hand').map(card => <button key={card.id} className={`tabletop-hand-card ${card.id === activeCard ? 'active' : ''}`} onClick={() => { setActiveCard(card.id); setInspectedCard(card); setMoveMode(false) }}><img src={card.art_path} alt="" /><strong>{card.name}</strong><small>{card.type_id} · {card.rule_ids.join(' / ')}</small></button>)}</div></div>
      <div className="tabletop-controls"><span>{active?.name || 'Select a card, then choose a board slot'}</span><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'board' || active.type_id !== 'monster' || active.attacked} onClick={() => void act('attack', { copy_id: activeCard })}>Attack</button><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'board' || active.type_id !== 'spell'} onClick={() => void act('activate', { copy_id: activeCard })}>Activate Spell</button><button className="secondary" disabled={!myTurn || busy || active?.zone !== 'board'} onClick={() => setMoveMode(value => !value)}>{moveMode ? 'Cancel move' : 'Move'}</button><button className="primary" disabled={!myTurn || busy} onClick={() => void act('pass')}>Pass turn ↗</button></div>
      {match.status === 'finished' && <div className="tcg-result"><h3>Match rewards</h3>{Object.entries(match.rewards).map(([seat, reward]) => <p key={seat}>{match.players[Number(seat)]?.username}: {Object.entries(reward.resources).map(([kind, amount]) => `${amount} ${kind}`).join(', ') || 'Daily reward limit reached'}{reward.copy_id && ' · New card won!'}</p>)}</div>}
      <div className="tabletop-log"><h3>Match log</h3><ol>{match.log.map(entry => <li key={entry.revision}>{entry.text}</li>)}</ol></div>
    </section>}
  </section>
}
