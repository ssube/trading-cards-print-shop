import { useState } from 'react'
import { PapermillGame } from './PapermillGame'
import { FishingGame } from './FishingGame'
import { ShooterGame } from './ShooterGame'
import { TabletopGame } from './TabletopGame'
import type { State } from './types'

type GameId = 'fishing' | 'papermill' | 'tabletop' | 'shooter'
const games: { id: GameId; icon: string; title: string; description: string; ready: boolean }[] = [
  { id: 'fishing', icon: '♧', title: 'Fishing', description: 'Every gacha game needs a fishing minigame. This pond pays in ink, paper, and occasionally fish.', ready: true },
  { id: 'papermill', icon: '◉', title: 'Feline Papermill', description: 'Hire cats, make paper, and somehow end up reporting to the cats.', ready: true },
  { id: 'tabletop', icon: '▤', title: 'The Trading Card Game', description: 'Wait, you can play with these cards? Start with a three-card table.', ready: true },
  { id: 'shooter', icon: '✧', title: 'Pressroom Inferno', description: 'It runs a haunted first-person maze. Please do not feed the furnace.', ready: true },
]

export function GamesHub({ state, onChanged, offline }: { state: State; onChanged: () => Promise<void>; offline: boolean }) {
  const [selected, setSelected] = useState<GameId | null>(null)
  return <section className="page games-page">{selected ? <><button type="button" className="secondary" onClick={() => setSelected(null)}>← All games</button>{selected === 'papermill' && <PapermillGame onChanged={onChanged} />}{selected === 'fishing' && <FishingGame onChanged={onChanged} />}{selected === 'shooter' && <ShooterGame onReward={onChanged} />}{selected === 'tabletop' && <TabletopGame state={state} onChanged={onChanged} offline={offline} />}</> : <><div className="page-intro"><p className="eyebrow">BEYOND THE PRINTING PRESS</p><h1>Games in the <em>works.</em></h1><p>More ways to pass the time between prints are on the workshop calendar.</p></div><div className="games-grid">{games.map(game => <article className="game-stub" key={game.id}><div className="game-stub-top"><span className="game-stub-icon" aria-hidden="true">{game.icon}</span><span className="game-stub-status">{game.ready ? 'NOW PLAYING' : 'COMING SOON'}</span></div><h2>{game.title}</h2><p>{game.description}</p>{game.ready && <button className="secondary" onClick={() => setSelected(game.id)}>Play ↗</button>}</article>)}</div></>}</section>
}
