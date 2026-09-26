import type { Part } from './types'

export function printInkCost(ruleCount: number, finishId: string) {
  return Math.max(1, ruleCount - 1) + (finishId === 'standard' ? 0 : 2)
}

export function printCost(catalog: Part[], ruleCount: number, finishId: string, borderId: string, backId: string, foilBack: boolean) {
  const cost: Record<string, number> = { paper: 1, ink: printInkCost(ruleCount, finishId), foil: 0 }
  const partCost = (id: string) => JSON.parse(catalog.find(part => part.id === id)?.cost_json || '{}') as Record<string, number>
  for (const id of [finishId, borderId, backId]) {
    for (const [kind, amount] of Object.entries(partCost(id))) cost[kind] = (cost[kind] || 0) + amount
  }
  if (foilBack && backId !== 'mischief' && finishId !== 'standard') {
    cost.ink += 1
    cost.foil += partCost(finishId).foil || 0
  }
  return cost
}
