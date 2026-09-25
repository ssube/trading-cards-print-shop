const cache = new Map<string, string>()

// The marks are generated from the copy ID, so every view and export agrees.
export function wearTexture(copyId: string, condition: number): string {
  const band = condition >= 80 ? 0 : condition >= 45 ? 1 : 2
  const key = `${copyId}:${band}`
  const cached = cache.get(key)
  if (cached) return cached
  let seed = [...copyId].reduce((value, letter) => (Math.imul(value, 31) + letter.charCodeAt(0)) >>> 0, 2166136261)
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const counts = [20, 55, 105]
  const marks = Array.from({ length: counts[band] }, () => {
    const x = Math.round(random() * 400)
    const y = Math.round(random() * 560)
    const radius = (0.4 + random() * (band + 1) * 1.7).toFixed(1)
    const opacity = (0.1 + random() * 0.28).toFixed(2)
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#6d523b" opacity="${opacity}"/>`
  }).join('')
  const fibers = Array.from({ length: 8 + band * 10 }, () => {
    const x = Math.round(random() * 400)
    const y = Math.round(random() * 560)
    const length = Math.round(5 + random() * (10 + band * 12))
    return `<path d="M${x} ${y}l${length} ${Math.round(length * (random() - 0.5))}" stroke="#715b47" stroke-width="${band === 2 ? 1.4 : 0.8}" opacity=".26" fill="none"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"><rect width="400" height="560" fill="#aa956e" opacity="${[0.03, 0.07, 0.13][band]}"/>${marks}${fibers}</svg>`
  const result = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  cache.set(key, result)
  return result
}

export function wearOpacity(condition: number): number {
  return Math.min(0.95, Math.max(0, (100 - condition) / 75))
}
