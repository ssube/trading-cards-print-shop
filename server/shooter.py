"""The Infernal Press: short original maze runs and bounded rewards.

Callers wrap mutations in ``db.transaction()`` and authenticate/CSRF-check requests.
The browser renders combat; this module validates the sequence and caps rewards.
"""

from datetime import datetime

from . import game

BOSSES = (
    ("demon-cinderlord", "Cinderlord of the Press", "Even the furnace asks for a day off.", "monster", ["arrival", "grow"]),
    ("demon-ashwarden", "Ashwarden's Gate", "Its hinges were cast from yesterday's excuses.", "land", ["dusk", "mend"]),
    ("demon-pressfiend", "The Pressfiend's Bargain", "Read the fine print. Then read it again.", "spell", ["arrival", "return"]),
)
MAX_RUNS = 3
KILLS_PER_RUN = 3
RESOURCE_CAP = 6


def _elapsed(started_at):
    try:
        return (game.now() - datetime.fromisoformat(started_at)).total_seconds()
    except (ValueError, TypeError):
        return 0


def _run(db, user_id, run_id):
    run = db.execute("SELECT * FROM shooter_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
    game.need(run is not None, "Run not found", 404)
    game.need(run["day"] == game.day(), "This run has expired", 409)
    return run


def status(db, user_id):
    today = game.day()
    rows = db.execute("SELECT * FROM shooter_runs WHERE user_id=? AND day=? ORDER BY started_at,id", (user_id, today)).fetchall()
    kills = sum(int(row["kill_mask"]).bit_count() for row in rows)
    boss_claimed = any(row["boss_claimed"] for row in rows)
    current = next((row for row in reversed(rows) if not row["boss_claimed"]), None)
    return {
        "day": today,
        "runs_used": len(rows), "run_limit": MAX_RUNS,
        "resources_earned": min(kills, RESOURCE_CAP), "resource_limit": RESOURCE_CAP,
        "boss_card_claimed": boss_claimed,
        "active_run": _public_run(current) if current else None,
        "bosses": [{"design_id": design_id, "name": name} for design_id, name, *_ in BOSSES],
    }


def _public_run(row):
    return {"id": row["id"], "boss_id": row["boss_id"], "kill_mask": row["kill_mask"],
            "boss_claimed": bool(row["boss_claimed"]), "started_at": row["started_at"]}


def start_run(db, user_id):
    today = game.day()
    runs = db.execute("SELECT COUNT(*) FROM shooter_runs WHERE user_id=? AND day=?", (user_id, today)).fetchone()[0]
    game.need(runs < MAX_RUNS, "All three runs have been used today", 409)
    boss_id = BOSSES[(datetime.fromisoformat(today).toordinal() + runs) % len(BOSSES)][0]
    run_id = game.uid()
    db.execute("INSERT INTO shooter_runs(id,user_id,day,boss_id,started_at,kill_mask,boss_claimed,last_kill_at) "
               "VALUES(?,?,?,?,?,0,0,NULL)", (run_id, user_id, today, boss_id, game.stamp()))
    return _public_run(_run(db, user_id, run_id))


def claim_kill(db, user_id, run_id, enemy_index):
    game.need(type(enemy_index) is int and 0 <= enemy_index < KILLS_PER_RUN, "Invalid enemy", 400)
    run = _run(db, user_id, run_id)
    game.need(not run["boss_claimed"], "This run is over", 409)
    bit = 1 << enemy_index
    game.need(not run["kill_mask"] & bit, "Enemy reward already claimed", 409)
    game.need(_elapsed(run["started_at"]) >= (enemy_index + 1) * 2, "The enemy is still in the maze", 409)
    if run["last_kill_at"]:
        game.need(_elapsed(run["last_kill_at"]) >= 1, "Give the next enemy a moment", 409)
    db.execute("UPDATE shooter_runs SET kill_mask=kill_mask|?,last_kill_at=? WHERE id=?", (bit, game.stamp(), run_id))
    earned = db.execute("SELECT SUM((kill_mask & 1) + ((kill_mask >> 1) & 1) + ((kill_mask >> 2) & 1)) "
                        "FROM shooter_runs WHERE user_id=? AND day=?", (user_id, game.day())).fetchone()[0] or 0
    resource = None
    if earned <= RESOURCE_CAP:
        resource = "paper" if (enemy_index + (int(run_id[:2], 16) % 2)) % 2 == 0 else "ink"
        game.adjust_resources(db, user_id, {resource: 1})
    return {"enemy_index": enemy_index, "resource": resource, "status": status(db, user_id)}


def claim_boss(db, user_id, run_id):
    run = _run(db, user_id, run_id)
    game.need(not run["boss_claimed"], "Boss reward already claimed", 409)
    game.need(run["kill_mask"] == 7, "Defeat the three guards first", 409)
    game.need(_elapsed(run["started_at"]) >= 12, "The boss is still preparing", 409)
    today_awarded = db.execute("SELECT COUNT(*) FROM shooter_runs WHERE user_id=? AND day=? AND boss_claimed=1", (user_id, game.day())).fetchone()[0]
    copy_id = None
    if not today_awarded:
        copy_id = game.mint_copy(db, run["boss_id"], user_id, quality_override=85)
    db.execute("UPDATE shooter_runs SET boss_claimed=1 WHERE id=?", (run_id,))
    return {"boss_id": run["boss_id"], "copy_id": copy_id, "status": status(db, user_id)}
