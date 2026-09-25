export const pages = ['workshop', 'library', 'decks', 'print', 'games', 'progress', 'finishes', 'commissions', 'trading', 'admin', 'card'] as const
export type Page = typeof pages[number]
export type Route = { page: Page; kind?: string; id?: string }

export function readRoute(): Route {
  const [page, kind, id] = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent)
  return { page: pages.includes(page as Page) ? page as Page : 'workshop', kind, id }
}

export function routeUrl(page: Page, kind?: string, id?: string) {
  return `#/${[page, kind, id].filter((part): part is string => !!part).map(encodeURIComponent).join('/')}`
}

export function navigate(page: Page, kind?: string, id?: string) {
  const hash = routeUrl(page, kind, id)
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'))
  else window.location.hash = hash
}
