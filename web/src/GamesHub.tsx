import { useState } from 'react'
import { PapermillGame } from './PapermillGame'

type GameId = 'fishing' | 'papermill' | 'tabletop' | 'shooter'
const games: { id: GameId; icon: string; title: string; description: string; ready: boolean }[] = [
  { id: 'fishing', icon: '♧', title: 'Fishing', description: 'Every gacha game needs a fishing minigame. The fish are still reviewing their contracts.', ready: false },
  { id: 'papermill', icon: '◉', title: 'Feline Papermill', description: 'Hire cats to make paper. Spend the paper hiring cats. The mill has no questions.', ready: true },
  { id: 'tabletop', icon: '▤', title: 'The Trading Card Game', description: 'Wait, you can play with these cards?', ready: false },
  { id: 'shooter', icon: '✧', title: 'Pressroom Inferno', description: 'It does run doom. The printing press just needs a few more upgrades.', ready: false },
]

export function GamesHub({ onChanged }: { onChanged: () => Promise<void> }) {
  const [selected, setSelected] = useState<GameId | null>(null)
  return <section className="page games-page">{selected ? <><button type="button" className="secondary" onClick={() => setSelected(null)}>← All games</button>{selected === 'papermill' && <PapermillGame onChanged={onChanged} />}</> : <><div className="page-intro"><p className="eyebrow">BEYOND THE PRINTING PRESS</p><h1>Games in the <em>works.</em></h1><p>More ways to pass the time between prints are on the workshop calendar.</p></div><div className="games-grid">{games.map(game => <article className="game-stub" key={game.id}><div className="game-stub-top"><span className="game-stub-icon" aria-hidden="true">{game.icon}</span><span className="game-stub-status">{game.ready ? 'NOW PLAYING' : 'COMING SOON'}</span></div><h2>{game.title}</h2><p>{game.description}</p>{game.ready && <button className="secondary" onClick={() => setSelected(game.id)}>Play ↗</button>}</article>)}</div></>}</section>
}
