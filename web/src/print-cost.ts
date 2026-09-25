export function printInkCost(ruleCount: number, finishId: string) {
  return Math.max(1, ruleCount - 1) + (finishId === 'standard' ? 0 : 2)
}
