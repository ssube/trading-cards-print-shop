import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './shooter-game.css'

type Run = { id: string; boss_id: string; kill_mask: number; boss_claimed: boolean; started_at: string }
type Status = { day: string; runs_used: number; run_limit: number; resources_earned: number; resource_limit: number; boss_card_claimed: boolean; active_run: Run | null; bosses: { design_id: string; name: string }[] }
type Reward = { resource?: string | null; copy_id?: string | null; status: Status }
type Enemy = { index: number; x: number; y: number; health: number; boss: boolean; dead: boolean; lastAttack: number }
type World = { x: number; y: number; angle: number; health: number; enemies: Enemy[]; run: Run; moving: Set<string>; lastShot: number; busy: boolean; ended: boolean }

const maze = [
  '111111111111', '100000000001', '101101011101', '100001000001',
  '101001011101', '100000000001', '101110110101', '100000000001',
  '101011011101', '100010000001', '100000000001', '111111111111',
]
const initialEnemies = [
  { x: 3.5, y: 1.5 }, { x: 5.5, y: 5.5 }, { x: 8.5, y: 7.5 }, { x: 9.5, y: 10.5 },
]
const bossNames: Record<string, string> = {
  'demon-cinderlord': 'Cinderlord of the Press',
  'demon-ashwarden': "Ashwarden's Gate",
  'demon-pressfiend': "The Pressfiend's Bargain",
}
const wall = (x: number, y: number) => maze[Math.floor(y)]?.[Math.floor(x)] !== '0'
const clearPath = (x: number, y: number, tx: number, ty: number) => {
  const distance = Math.hypot(tx - x, ty - y)
  for (let d = .1; d < distance; d += .08) if (wall(x + (tx - x) * d / distance, y + (ty - y) * d / distance)) return false
  return true
}
function newWorld(run: Run): World {
  return { x: 1.5, y: 1.5, angle: .1, health: 100, run, moving: new Set(), lastShot: 0, busy: false, ended: false,
    enemies: initialEnemies.map((pos, index) => ({ ...pos, index, health: index === 3 ? 5 : 2, boss: index === 3,
      dead: index === 3 ? run.boss_claimed : !!(run.kill_mask & (1 << index)), lastAttack: 0 })) }
}
function draw(canvas: HTMLCanvasElement, world: World, time: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const width = canvas.width, height = canvas.height, horizon = Math.round(height * .52)
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#160e1c'); sky.addColorStop(1, '#5e3334')
  ctx.fillStyle = sky; ctx.fillRect(0, 0, width, horizon)
  const floor = ctx.createLinearGradient(0, horizon, 0, height)
  floor.addColorStop(0, '#413734'); floor.addColorStop(1, '#161a1b')
  ctx.fillStyle = floor; ctx.fillRect(0, horizon, width, height - horizon)
  const rays = 180, rayWidth = width / rays, fov = Math.PI / 2.8, depths: number[] = []
  for (let i = 0; i < rays; i++) {
    const angle = world.angle + (i / rays - .5) * fov
    let distance = .02
    while (distance < 15 && !wall(world.x + Math.cos(angle) * distance, world.y + Math.sin(angle) * distance)) distance += .025
    const corrected = distance * Math.cos(angle - world.angle)
    depths[i] = corrected
    const size = Math.min(height * 1.8, height / Math.max(.12, corrected))
    const cellX = world.x + Math.cos(angle) * distance, cellY = world.y + Math.sin(angle) * distance
    const edge = Math.min(cellX % 1, cellY % 1, 1 - cellX % 1, 1 - cellY % 1)
    const shade = Math.max(20, 122 - corrected * 10), seam = edge < .04 ? 20 : 0
    ctx.fillStyle = `rgb(${Math.round(shade + seam)},${Math.round(shade * .57)},${Math.round(shade * .48)})`
    ctx.fillRect(i * rayWidth, horizon - size / 2, rayWidth + 1, size)
    ctx.fillStyle = `rgba(20,11,17,${Math.min(.64, corrected * .035)})`
    ctx.fillRect(i * rayWidth, horizon - size / 2, rayWidth + 1, size)
  }
  const visible = world.enemies.filter(enemy => !enemy.dead && (!enemy.boss || world.enemies.slice(0, 3).every(e => e.dead)))
    .map(enemy => ({ enemy, distance: Math.hypot(enemy.x - world.x, enemy.y - world.y), angle: Math.atan2(enemy.y - world.y, enemy.x - world.x) }))
    .sort((a, b) => b.distance - a.distance)
  for (const { enemy, distance, angle } of visible) {
    let delta = angle - world.angle
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    if (Math.abs(delta) > fov * .65 || distance < .25) continue
    const center = width * (.5 + delta / fov), column = Math.floor(center / rayWidth)
    if (distance > (depths[column] || 15) + .25) continue
    const size = Math.min(height, height / distance * (enemy.boss ? 1.1 : .72))
    const y = horizon + size * .18
    const pulse = Math.sin(time / 190 + enemy.index) * 4
    ctx.save(); ctx.shadowColor = enemy.boss ? '#ff503d' : '#f39147'; ctx.shadowBlur = enemy.boss ? 26 : 14
    ctx.fillStyle = enemy.boss ? '#731e32' : '#8b4032'
    ctx.beginPath(); ctx.ellipse(center, y, size * .26, size * .38, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = enemy.boss ? '#ffb647' : '#eec673'
    ctx.beginPath(); ctx.moveTo(center - size * .2, y - size * .28); ctx.lineTo(center - size * .35, y - size * .56 + pulse); ctx.lineTo(center - size * .04, y - size * .31)
    ctx.moveTo(center + size * .2, y - size * .28); ctx.lineTo(center + size * .35, y - size * .56 - pulse); ctx.lineTo(center + size * .04, y - size * .31); ctx.fill()
    ctx.fillStyle = '#f6dba0'; ctx.fillRect(center - size * .11, y - size * .08, size * .07, size * .05); ctx.fillRect(center + size * .04, y - size * .08, size * .07, size * .05)
    ctx.restore()
    ctx.fillStyle = '#231921'; ctx.fillRect(center - size * .28, y - size * .54, size * .56, 5)
    ctx.fillStyle = enemy.boss ? '#ff9b63' : '#eec873'; ctx.fillRect(center - size * .28, y - size * .54, size * .56 * enemy.health / (enemy.boss ? 5 : 2), 5)
  }
  ctx.strokeStyle = '#fff2ca'; ctx.lineWidth = 2; ctx.beginPath()
  ctx.moveTo(width / 2 - 9, horizon); ctx.lineTo(width / 2 - 3, horizon)
  ctx.moveTo(width / 2 + 3, horizon); ctx.lineTo(width / 2 + 9, horizon)
  ctx.moveTo(width / 2, horizon - 9); ctx.lineTo(width / 2, horizon - 3)
  ctx.moveTo(width / 2, horizon + 3); ctx.lineTo(width / 2, horizon + 9); ctx.stroke()
  ctx.fillStyle = '#1b191c'; ctx.fillRect(width * .39, height - 31, width * .22, 40)
  ctx.fillStyle = '#b78359'; ctx.fillRect(width * .47, height - 68, width * .06, 76)
  ctx.fillStyle = '#e7ad67'; ctx.fillRect(width * .485, height - 81, width * .03, 22)
}

export function ShooterGame({ onReward }: { onReward?: () => void | Promise<void> }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [message, setMessage] = useState('')
  const [health, setHealth] = useState(100)
  const [remaining, setRemaining] = useState(3)
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useRef<World | null>(null)
  const swipe = useRef<number | null>(null)
  const shot = useRef<() => void>(() => undefined)
  const hold = (key: string, down: boolean) => { if (down) world.current?.moving.add(key); else world.current?.moving.delete(key) }
  const load = async () => {
    const result = await api<Status>('/games/shooter')
    setStatus(result)
    if (result.active_run && !world.current) world.current = newWorld(result.active_run)
  }
  useEffect(() => { load().catch(error => setMessage(error.message)) }, [])
  useEffect(() => {
    const canvasNode = canvas.current
    if (!canvasNode) return
    let frame = 0, last = performance.now()
    const animate = (now: number) => {
      const delta = Math.min(.05, (now - last) / 1000); last = now
      const current = world.current
      if (current && !current.ended) {
        const turning = Number(current.moving.has('right')) - Number(current.moving.has('left'))
        current.angle += turning * delta * 2.1
        const forward = Number(current.moving.has('forward')) - Number(current.moving.has('back'))
        const strafe = Number(current.moving.has('strafeRight')) - Number(current.moving.has('strafeLeft'))
        const dx = (Math.cos(current.angle) * forward - Math.sin(current.angle) * strafe) * delta * 2.4
        const dy = (Math.sin(current.angle) * forward + Math.cos(current.angle) * strafe) * delta * 2.4
        if (!wall(current.x + dx + Math.sign(dx) * .17, current.y) && !wall(current.x + dx, current.y)) current.x += dx
        if (!wall(current.x, current.y + dy + Math.sign(dy) * .17) && !wall(current.x, current.y + dy)) current.y += dy
        for (const enemy of current.enemies) {
          if (enemy.dead || (enemy.boss && current.enemies.slice(0, 3).some(e => !e.dead))) continue
          const distance = Math.hypot(enemy.x - current.x, enemy.y - current.y)
          if (distance < 5 && distance > .72 && clearPath(enemy.x, enemy.y, current.x, current.y)) {
            const step = delta * (enemy.boss ? .42 : .32)
            const mx = (current.x - enemy.x) / distance * step, my = (current.y - enemy.y) / distance * step
            if (!wall(enemy.x + mx, enemy.y)) enemy.x += mx
            if (!wall(enemy.x, enemy.y + my)) enemy.y += my
          }
          if (distance < .9 && now - enemy.lastAttack > 1200) {
            enemy.lastAttack = now; current.health = Math.max(0, current.health - (enemy.boss ? 18 : 9)); setHealth(current.health)
            if (current.health === 0) { current.ended = true; setMessage('The press has claimed this run. Start another while attempts remain.') }
          }
        }
      }
      if (current) draw(canvasNode, current, now)
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    const down = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault()
      const key = ({ w: 'forward', ArrowUp: 'forward', s: 'back', ArrowDown: 'back', a: 'strafeLeft', d: 'strafeRight', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, string>)[event.key]
      if (key) hold(key, true)
      if (event.code === 'Space' && !event.repeat) shot.current()
    }
    const up = (event: KeyboardEvent) => {
      const key = ({ w: 'forward', ArrowUp: 'forward', s: 'back', ArrowDown: 'back', a: 'strafeLeft', d: 'strafeRight', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, string>)[event.key]
      if (key) hold(key, false)
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  const shoot = async () => {
    const current = world.current
    if (!current || current.ended || current.busy || performance.now() - current.lastShot < 350) return
    current.lastShot = performance.now()
    const target = current.enemies.filter(enemy => !enemy.dead && (!enemy.boss || current.enemies.slice(0, 3).every(e => e.dead)))
      .map(enemy => { let angle = Math.atan2(enemy.y - current.y, enemy.x - current.x) - current.angle; while (angle > Math.PI) angle -= Math.PI * 2; while (angle < -Math.PI) angle += Math.PI * 2
        return { enemy, distance: Math.hypot(enemy.x - current.x, enemy.y - current.y), angle } })
      .filter(candidate => candidate.distance < 5 && Math.abs(candidate.angle) < .13 && clearPath(current.x, current.y, candidate.enemy.x, candidate.enemy.y))
      .sort((a, b) => a.distance - b.distance)[0]?.enemy
    if (!target) return
    target.health -= 1
    if (target.health > 0) return
    current.busy = true; setBusy(true)
    try {
      if (target.boss) {
        const reward = await api<Reward>(`/games/shooter/runs/${current.run.id}/boss`, 'POST')
        setStatus(reward.status); setMessage(reward.copy_id ? `${bossNames[current.run.boss_id]} joins your card box!` : 'Boss defeated. The daily card was already claimed.')
        current.ended = true
      } else {
        const reward = await api<Reward>(`/games/shooter/runs/${current.run.id}/kills`, 'POST', { enemy_index: target.index })
        setStatus(reward.status); setMessage(reward.resource ? `Guard defeated: +1 ${reward.resource}.` : 'Guard defeated. Daily resource cap reached.')
        setRemaining(current.enemies.slice(0, 3).filter(e => !e.dead).length - 1)
      }
      target.dead = true
      await onReward?.()
    } catch (error) { target.health = 1; setMessage((error as Error).message) }
    finally { current.busy = false; setBusy(false) }
  }
  shot.current = shoot
  const start = async () => {
    setBusy(true)
    try { const run = await api<Run>('/games/shooter/runs', 'POST'); world.current = newWorld(run); setHealth(100); setRemaining(3); setStatus(await api<Status>('/games/shooter')); setMessage(`Enter the maze. ${bossNames[run.boss_id]} waits beyond its guards.`) }
    catch (error) { setMessage((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="shooter-game" aria-label="Infernal Press maze shooter">
    <div className="shooter-heading"><div><p className="eyebrow">THE INFERNAL PRESS</p><h2>One more run through the furnace.</h2><p>Defeat three guards to face a boss. The first boss each day leaves a card behind.</p></div><div className="shooter-day">{status ? <><strong>{status.runs_used}/{status.run_limit}</strong><span>RUNS TODAY</span><small>{status.resources_earned}/{status.resource_limit} resources · {status.boss_card_claimed ? 'Boss card claimed' : 'Boss card available'}</small></> : 'Loading…'}</div></div>
    <div className="shooter-frame"><canvas ref={canvas} width={800} height={450} onPointerDown={event => { swipe.current = event.clientX; (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId) }} onPointerMove={event => { if (swipe.current === null || !world.current) return; world.current.angle += (event.clientX - swipe.current) * .006; swipe.current = event.clientX }} onPointerUp={() => { swipe.current = null }} aria-label="First person maze view; drag to look around" />
      <div className="shooter-hud"><span>♥ {health}</span><span>{world.current?.ended ? 'RUN OVER' : `GUARDS ${remaining} · ${world.current ? bossNames[world.current.run.boss_id] : 'NO RUN'}`}</span></div>
      {!world.current && <div className="shooter-overlay"><strong>The furnace is waiting.</strong><button className="primary" disabled={busy || !status || status.runs_used >= status.run_limit} onClick={start}>Start a run ↗</button></div>}
      {world.current?.ended && <div className="shooter-overlay"><strong>{health === 0 ? 'Run lost' : 'Run complete'}</strong><button className="primary" disabled={busy || !status || status.runs_used >= status.run_limit} onClick={start}>Start another run ↗</button></div>}
    </div>
    <div className="shooter-controls"><div className="shooter-pad">{[['◀', 'left'], ['▲', 'forward'], ['▼', 'back'], ['▶', 'right']].map(([label, key]) => <button key={key} onPointerDown={event => { event.preventDefault(); hold(key, true) }} onPointerUp={() => hold(key, false)} onPointerCancel={() => hold(key, false)} onPointerLeave={() => hold(key, false)} aria-label={key}>{label}</button>)}</div><button className="shooter-fire" disabled={!world.current || busy || !!world.current.ended} onPointerDown={event => { event.preventDefault(); shoot() }} onClick={() => shoot()}>FIRE</button></div>
    <p className="shooter-help">W/S move · A/D strafe · arrows turn · Space fires · drag the view to look. On touch, use the pad and Fire.</p>
    {message && <p className="shooter-message" role="status">{message}</p>}
  </section>
}
