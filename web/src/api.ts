import { isOfflineDemo, offlineApi } from './offline-game'

let csrf = ''
export function setCsrf(value: string) { csrf = value }
export async function api<T>(path: string, method = 'GET', body?: unknown, extra?: Record<string, string>): Promise<T> {
  if (isOfflineDemo()) return offlineApi<T>(path, method, body, extra)
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...extra },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  let result: unknown
  try { result = await response.json() } catch { result = null }
  if (!response.ok) throw new Error((result as { detail?: string } | null)?.detail || `Request failed (${response.status})`)
  return result as T
}
