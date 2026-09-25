import type { CollectionProgress as Progress } from './types'

const categories: { key: keyof Progress; label: string; detail: string; icon: string }[] = [
  { key: 'rules', label: 'Rules', detail: 'learned', icon: '✧' },
  { key: 'foils', label: 'Foils', detail: 'learned', icon: '◈' },
  { key: 'borders', label: 'Borders', detail: 'learned', icon: '▣' },
  { key: 'backs', label: 'Card backs', detail: 'learned', icon: '◇' },
  { key: 'cards', label: 'Unique cards', detail: 'in your box', icon: '▤' },
]

export function CollectionProgress({ progress }: { progress: Progress }) {
  return <section className="collection-progress" aria-label="Collection completion">
    <div className="collection-progress-title"><span>YOUR COLLECTION</span><strong>What you've found so far</strong></div>
    <div className="collection-progress-grid">{categories.map(category => {
      const count = progress[category.key]
      return <div className="collection-progress-item" key={category.key}>
        <span className="collection-progress-icon" aria-hidden="true">{category.icon}</span>
        <div className="collection-progress-copy"><div className="collection-progress-line"><strong>{category.label}</strong><b>{count.percent}%</b></div>
          <progress value={count.collected} max={Math.max(1, count.total)} aria-label={`${category.label} collected`} />
          <small>{count.collected} / {count.total} {category.detail}</small>
        </div>
      </div>
    })}</div>
  </section>
}
