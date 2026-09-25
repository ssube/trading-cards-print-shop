import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import './fishing-game.css'

export type FishingChallenge = { cast_id: string; target_ms: number; tolerance_ms: number; elapsed_ms: number }
export type FishingState = { day: string; used: number; limit: number; catches: number; pending: FishingChallenge | null }
export type FishingResult = { cast_id: string; success: boolean; reward: { resources?: Record<string, number>; card?: { design_id: string; copy_id: string } } }

const FISH_NAMES: Record<string, string> = {
  'fish-lanternfin': 'Lanternfin', 'fish-inkscale': 'Inkscale', 'fish-moonkoi': 'Moon Koi',
}

function resultText(result: FishingResult) {
  if (!result.success) return 'The fish slipped free. Try another cast tomorrow, or use one of today’s remaining casts.'
  if (result.reward.card) return `A rare ${FISH_NAMES[result.reward.card.design_id] || 'fish'}! Its card is now in your box.`
  const [kind, count] = Object.entries(result.reward.resources || {})[0] || ['resource', 0]
  return `Caught! You found ${count} ${kind}.`
}

export function FishingGame({ onChanged }: { onChanged?: () => Promise<void> | void }) {
  const [state, setState] = useState<FishingState | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const current = await api<FishingState>('/games/fishing')
    setState(current)
    return current
  }, [])

  useEffect(() => { void load().catch(reason => setError((reason as Error).message)) }, [load])
  useEffect(() => {
    const challenge = state?.pending
    if (!challenge) return
    const started = Date.now() - challenge.elapsed_ms
    const update = () => setElapsed(Math.max(0, Date.now() - started))
    update()
    const timer = window.setInterval(update, 32)
    return () => window.clearInterval(timer)
  }, [state?.pending?.cast_id, state?.pending?.elapsed_ms])

  async function act() {
    if (busy || !state) return
    setBusy(true)
    setError('')
    try {
      if (state.pending) {
        const result = await api<FishingResult>('/games/fishing/reel', 'POST', { cast_id: state.pending.cast_id })
        setMessage(resultText(result))
        await load()
        if (result.success) await onChanged?.()
      } else {
        setMessage('Watch the marker. Reel when it crosses the golden band!')
        await api<FishingState>('/games/fishing/cast', 'POST').then(setState)
      }
    } catch (reason) {
      setError((reason as Error).message)
      await load().catch(() => undefined)
    } finally { setBusy(false) }
  }

  const challenge = state?.pending
  const trackLength = challenge ? challenge.target_ms + challenge.tolerance_ms + 600 : 3000
  const marker = challenge ? Math.min(100, elapsed / trackLength * 100) : 0
  const bandLeft = challenge ? Math.max(0, (challenge.target_ms - challenge.tolerance_ms) / trackLength * 100) : 0
  const bandWidth = challenge ? challenge.tolerance_ms * 2 / trackLength * 100 : 0
  return <section className="fishing-game" aria-label="Fishing minigame">
    <div className="fishing-water" aria-hidden="true"><span className="fishing-moon">☾</span><span className="fishing-bobber">◉</span><span className="fishing-ripple" /></div>
    <div className="fishing-content"><p className="eyebrow">A QUIET SPOT BEHIND THE PRESS</p><h2>Cast into the inkpond.</h2>
      <p>Five casts each day. Most catches bring paper or ink; a rare fish might follow you home as a card.</p>
      <p className="fishing-count">{state ? `${state.limit - state.used} casts left today · ${state.catches} caught` : 'Checking the water…'}</p>
      {challenge && <div className="fishing-reel" aria-label="Reel timing challenge">
        <div className="fishing-track"><span className="fishing-band" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} /><span className="fishing-marker" style={{ left: `${marker}%` }} /></div>
        <small>Reel when the marker reaches the golden band</small>
      </div>}
      <button className="primary" disabled={busy || !state || (!challenge && state.used >= state.limit)} onClick={() => void act()}>{busy ? 'Working…' : challenge ? 'Reel now!' : 'Cast a line'}</button>
      {message && <p className="fishing-message" role="status">{message}</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  </section>
}
