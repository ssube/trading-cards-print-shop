const games = [
  { icon: '♧', title: 'Fishing', description: 'Every gacha game needs a fishing minigame. The fish are still reviewing their contracts.' },
  { icon: '◉', title: 'Feline Papermill', description: 'Hire cats to make paper. Spend the paper hiring cats. The mill has no questions.' },
  { icon: '▤', title: 'The Trading Card Game', description: 'Wait, you can play with these cards?' },
  { icon: '✧', title: 'Doom', description: 'It does run Doom. The printing press just needs a few more upgrades.' },
]

export function GamesHub() {
  return <section className="page games-page"><div className="page-intro"><p className="eyebrow">BEYOND THE PRINTING PRESS</p><h1>Games in the <em>works.</em></h1><p>More ways to pass the time between prints are on the workshop calendar.</p></div>
    <div className="games-grid">{games.map(game => <article className="game-stub" key={game.title}><div className="game-stub-top"><span className="game-stub-icon" aria-hidden="true">{game.icon}</span><span className="game-stub-status">COMING SOON</span></div><h2>{game.title}</h2><p>{game.description}</p></article>)}</div>
  </section>
}
