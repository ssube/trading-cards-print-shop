import { routeUrl } from './routes'
import type { CardCopy } from './types'

function base64url(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

export async function publicCardUrl(card: CardCopy, offline: boolean) {
  let hash: string
  if (offline) {
    const art = new URL(card.art_path, document.baseURI)
    const asset = art.pathname.match(/\/demo-art\/([a-zA-Z0-9_-]+\.png)$/)
    const publicCopy = { ...card, art_path: asset ? `demo-art/${asset[1]}` : card.art_path, owner_id: null, listed: 0, exact_grade_visible: card.slab_grade !== null }
    const bytes = new TextEncoder().encode(JSON.stringify(publicCopy))
    const payload = typeof CompressionStream === 'undefined' ? `j.${base64url(bytes)}` : `g.${base64url(new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()))}`
    hash = routeUrl('card', 'snapshot', payload)
  } else {
    hash = routeUrl('card', 'copy', card.id)
  }
  const url = new URL(window.location.href)
  url.hash = hash.slice(1)
  if (offline) url.searchParams.delete('demo')
  return url.toString()
}

export async function readPublicSnapshot(payload: string): Promise<CardCopy> {
  if (payload.length > 50000) throw new Error('This card link is too large.')
  try {
    const [format, encoded] = payload.split('.', 2)
    if (!encoded || !['g', 'j'].includes(format)) throw new Error('Invalid link')
    const bytes = fromBase64url(encoded)
    const raw = format === 'j' ? new TextDecoder().decode(bytes) : await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    if (raw.length > 100000) throw new Error('Too large')
    const card = JSON.parse(raw) as CardCopy
    if (!card || typeof card.id !== 'string' || typeof card.name !== 'string' || typeof card.art_path !== 'string' || !Array.isArray(card.rule_ids) || !Array.isArray(card.rule_text) || !['data:image/svg+xml,', 'https:', 'http:', 'demo-art/'].some(prefix => card.art_path.startsWith(prefix))) throw new Error('Invalid card')
    if (card.art_path.startsWith('demo-art/')) {
      if (!/^demo-art\/[a-zA-Z0-9_-]+\.png$/.test(card.art_path)) throw new Error('Invalid art')
      card.art_path = new URL(card.art_path, document.baseURI).href
    }
    return { ...card, owner_id: null, listed: 0 }
  } catch { throw new Error('This card link could not be opened.') }
}
