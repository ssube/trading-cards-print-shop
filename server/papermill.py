"""A small idle papermill with bounded main-game material output."""

from datetime import datetime, timezone

from . import game

MAX_CATS = 6
PAPER_LIMIT = 4
INK_LIMIT = 4
TICK_SECONDS = 30


def _current(db, user_id):
    row = db.execute("SELECT * FROM papermills WHERE user_id=?", (user_id,)).fetchone()
    if row:
        return dict(row)
    current = game.stamp()
    db.execute("INSERT INTO papermills(user_id,pulp,cats,roller,ink_vat,seconds_credit,last_at,day,paper_today,ink_today,last_tap_at) VALUES(?,0,0,0,0,0,?,?,0,0,NULL)", (user_id, current, game.day()))
    return dict(db.execute("SELECT * FROM papermills WHERE user_id=?", (user_id,)).fetchone())


def _advance(db, user_id):
    row = _current(db, user_id)
    now = datetime.now(timezone.utc)
    last = datetime.fromisoformat(row["last_at"])
    day = game.day()
    same_day = row["day"] == day
    start = last if same_day else max(last, now.replace(hour=0, minute=0, second=0, microsecond=0))
    elapsed = max(0, min(86400, int((now - start).total_seconds())))
    paper_today = row["paper_today"] if same_day else 0
    ink_today = row["ink_today"] if same_day else 0
    credit = (row["seconds_credit"] if same_day else 0) + elapsed * row["cats"]
    paper_period = 900 if not row["roller"] else 600
    ink_period = 1800 if not row["ink_vat"] else 1200
    # Cumulative work credit prevents repeat payouts when the page refreshes.
    paper = max(0, min(PAPER_LIMIT, credit // paper_period) - paper_today)
    ink = max(0, min(INK_LIMIT, credit // ink_period) - ink_today)
    if paper or ink:
        game.adjust_resources(db, user_id, {"paper": paper, "ink": ink})
    # Cap accrued time to one day to avoid unbounded values in dormant accounts.
    credit = min(86400 * MAX_CATS, credit)
    db.execute("UPDATE papermills SET seconds_credit=?,last_at=?,day=?,paper_today=?,ink_today=? WHERE user_id=?",
               (credit, now.isoformat(), day, paper_today + paper, ink_today + ink, user_id))
    return dict(db.execute("SELECT * FROM papermills WHERE user_id=?", (user_id,)).fetchone())


def status(db, user_id):
    row = _advance(db, user_id)
    return {"pulp": row["pulp"], "cats": row["cats"], "roller": bool(row["roller"]), "ink_vat": bool(row["ink_vat"]),
            "paper_today": row["paper_today"], "ink_today": row["ink_today"],
            "paper_limit": PAPER_LIMIT, "ink_limit": INK_LIMIT,
            "next_cat_cost": 5 * (row["cats"] + 1) if row["cats"] < MAX_CATS else None}


def tap(db, user_id):
    row = _advance(db, user_id)
    if row["last_tap_at"]:
        previous = datetime.fromisoformat(row["last_tap_at"])
        game.need((datetime.now(timezone.utc) - previous).total_seconds() >= .25, "Let the pulper finish its stroke", 429)
    db.execute("UPDATE papermills SET pulp=pulp+1,last_tap_at=? WHERE user_id=?", (game.stamp(), user_id))
    return status(db, user_id)


def hire(db, user_id):
    row = _advance(db, user_id)
    cost = 5 * (row["cats"] + 1)
    game.need(row["cats"] < MAX_CATS, "The mill is fully staffed")
    game.need(row["pulp"] >= cost, "Not enough pulp")
    cats = row["cats"] + 1
    db.execute("UPDATE papermills SET pulp=pulp-?,cats=? WHERE user_id=?", (cost, cats, user_id))
    card_id = {1: "mill-apprentice", 3: "mill-roller", 6: "mill-master"}.get(cats)
    if card_id:
        game.mint_copy(db, card_id, user_id, quality_override=84)
    return {**status(db, user_id), "card_id": card_id}


def upgrade(db, user_id, kind):
    row = _advance(db, user_id)
    options = {"roller": ("roller", 15), "ink_vat": ("ink_vat", 20)}
    game.need(kind in options, "Unknown mill upgrade")
    column, cost = options[kind]
    game.need(not row[column], "Upgrade already installed")
    game.need(row["pulp"] >= cost, "Not enough pulp")
    db.execute(f"UPDATE papermills SET pulp=pulp-?,{column}=1 WHERE user_id=?", (cost, user_id))
    return status(db, user_id)
