"""Five daily fishing casts with a server-timed reel challenge."""

import json
import secrets
from datetime import datetime

from . import game


DAILY_CASTS = 5
CAST_LIFETIME_MS = 30_000
FISH_DESIGNS = ("fish-lanternfin", "fish-inkscale", "fish-moonkoi")
RESOURCE_KINDS = ("paper", "ink", "paper", "ink", "paper", "ink", "foil")


def _elapsed_ms(row):
    started = datetime.fromisoformat(row["created_at"])
    return max(0, round((game.now() - started).total_seconds() * 1000))


def _challenge(row):
    return {"cast_id": row["id"], "target_ms": row["target_ms"],
            "tolerance_ms": row["tolerance_ms"], "elapsed_ms": _elapsed_ms(row)}


def state(db, user_id):
    """Return today's quota and any live cast; expired casts count as misses."""
    today = game.day()
    row = db.execute("SELECT * FROM fishing_casts WHERE user_id=? AND day=? AND resolved_at IS NULL "
                     "ORDER BY created_at DESC LIMIT 1", (user_id, today)).fetchone()
    if row and _elapsed_ms(row) >= CAST_LIFETIME_MS:
        db.execute("UPDATE fishing_casts SET resolved_at=?,success=0,reward_json='{}' "
                   "WHERE id=? AND resolved_at IS NULL", (game.stamp(), row["id"]))
        row = None
    used = db.execute("SELECT COUNT(*) FROM fishing_casts WHERE user_id=? AND day=?", (user_id, today)).fetchone()[0]
    catches = db.execute("SELECT COUNT(*) FROM fishing_casts WHERE user_id=? AND day=? AND success=1",
                         (user_id, today)).fetchone()[0]
    return {"day": today, "used": used, "limit": DAILY_CASTS, "catches": catches,
            "pending": _challenge(row) if row else None}


def cast(db, user_id):
    current = state(db, user_id)
    if current["pending"]:
        return current
    game.need(current["used"] < DAILY_CASTS, "All five casts are spent for today", 409)
    cast_id = game.uid()
    target_ms = 1400 + secrets.randbelow(1101)
    tolerance_ms = 375
    if secrets.randbelow(10) == 0:
        prize_kind = "card"
        prize_value = FISH_DESIGNS[secrets.randbelow(len(FISH_DESIGNS))]
    else:
        prize_kind = "resource"
        prize_value = RESOURCE_KINDS[secrets.randbelow(len(RESOURCE_KINDS))]
    db.execute("INSERT INTO fishing_casts(id,user_id,day,created_at,target_ms,tolerance_ms,prize_kind,prize_value) "
               "VALUES(?,?,?,?,?,?,?,?)",
               (cast_id, user_id, game.day(), game.stamp(), target_ms, tolerance_ms, prize_kind, prize_value))
    return state(db, user_id)


def reel(db, user_id, cast_id):
    game.need(isinstance(cast_id, str) and len(cast_id) <= 64, "Invalid cast")
    row = db.execute("SELECT * FROM fishing_casts WHERE id=? AND user_id=?", (cast_id, user_id)).fetchone()
    game.need(row is not None, "Cast not found", 404)
    if row["resolved_at"]:
        return {"cast_id": cast_id, "success": bool(row["success"]), "reward": json.loads(row["reward_json"])}

    elapsed_ms = _elapsed_ms(row)
    success = abs(elapsed_ms - row["target_ms"]) <= row["tolerance_ms"] and elapsed_ms < CAST_LIFETIME_MS
    reward = {}
    if success and row["prize_kind"] == "card":
        # The prize is chosen when the cast is made, then minted only once here.
        copy_id = game.mint_copy(db, row["prize_value"], user_id, quality_override=88)
        reward = {"card": {"design_id": row["prize_value"], "copy_id": copy_id}}
    elif success:
        amount = 1 if row["prize_value"] == "foil" else 2
        game.adjust_resources(db, user_id, {row["prize_value"]: amount})
        reward = {"resources": {row["prize_value"]: amount}}
    db.execute("UPDATE fishing_casts SET resolved_at=?,success=?,reward_json=? WHERE id=? AND resolved_at IS NULL",
               (game.stamp(), int(success), json.dumps(reward), cast_id))
    return {"cast_id": cast_id, "success": success, "reward": reward}
