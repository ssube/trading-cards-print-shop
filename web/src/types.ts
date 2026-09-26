export type Part = { id: string; kind: string; name: string; description: string; power: number; slot: string; cost_json: string; learned: number }
export type CardCopy = {
  id: string; design_id: string; owner_id: number | null; creator: string | null; origin_id: string | null
  type_id: string; rule_ids: string[]; theme_id: string; finish_id: string; border_id: string; back_id: string; back_finish_id: string | null; name: string; flavor: string; art_path: string
  rule_names: string[]; rule_text: string[]
  print_score: number; condition: number; centering_x: number; centering_y: number
  shift_c: number; shift_m: number; shift_y: number; shift_k: number; color_effect: string
  surface: number; edge: number; sleeved: number; slab_grade: number | null; listed: number
  grade: number; grade_name: string; estimated_grade: string; exact_grade_visible: boolean
}
export type Commission = { id: string; title: string; description: string; requirement: Record<string, unknown>; reward: Record<string, number>; repeatable: number; claimed: number }
export type NpcOffer = { id: string; npc_name: string; title: string; requirement: Record<string, unknown>; reward: Record<string, unknown>; claimed: boolean }
export type ProgressCount = { collected: number; total: number; percent: number }
export type CollectionProgress = { rules: ProgressCount; foils: ProgressCount; borders: ProgressCount; backs: ProgressCount; cards: ProgressCount }
export type State = { resources: Record<string, number>; library: CardCopy[]; catalog: Part[]; commissions: Commission[]; npcs: NpcOffer[]; collection_progress: CollectionProgress; generation_count: number; generation_limit: number; allowance_claimed: boolean }
export type Listing = { id: string; seller_id: number; seller: string; copy_id: string; wish: string; card: CardCopy; offers: { id: string; status: string; cards: CardCopy[] }[] }
export type StarterCard = { id: string; name: string; flavor: string; type_id: string; rule_ids: string[]; theme_id: string; finish_id: string; border_id: string; back_id: string; back_finish_id: string | null; art_path: string; copies: number }
export type StarterDeck = { id: string; name: string; theme: string; description: string; accent: string; featured: string; cards: StarterCard[] }
export type User = { id: number; username: string; is_admin: number; csrf: string; starter_deck_id: string | null }

export type DeckAnalysis = { type_counts: Record<string, number>; finish_counts: Record<string, number>; rule_counts: Record<string, number>; total_power: number; average_grade: number; protected: number }
export type DeckReward = { resources: Record<string, number>; card: { design_id: string; name: string; finish_id: string; slab_grade: number | null } | null }
export type Deck = { id: string; kind: 'curated' | 'custom'; title: string; theme: string; description: string; accent: string; slots: { key: string; design_id: string | null; type_id: string | null; label: string; card: CardCopy | null }[]; filled: number; total: number; claimed: boolean; reward: DeckReward | null; analysis: DeckAnalysis }
