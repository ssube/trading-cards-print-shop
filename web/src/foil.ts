export function aimFoil(element: HTMLElement, clientX: number, clientY: number) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100))
  const y = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100))
  element.style.setProperty('--foil-x', `${x}%`)
  element.style.setProperty('--foil-y', `${y}%`)
}

export function resetFoil(element: HTMLElement) {
  element.style.setProperty('--foil-x', '50%')
  element.style.setProperty('--foil-y', '50%')
}

export function aimFoilFromTilt(element: HTMLElement | null, x: number, y: number) {
  if (!element) return
  element.style.setProperty('--foil-x', `${Math.max(0, Math.min(100, 50 + x * 2))}%`)
  element.style.setProperty('--foil-y', `${Math.max(0, Math.min(100, 50 - y * 2))}%`)
}
