"""Manual two-player card table and one-time solo practice rewards."""
import json
import secrets
import string

from . import game

PRACTICE = (
    ("place", "tabletop-opening-hand"),
    ("attack", "tabletop-counter-keeper"),
    ("score", "tabletop-playmaker"),
)
ALPHABET = string.ascii_uppercase.replace("I", "").replace("O", "") + "23456789"


def init_tables(db):
    schema = """
    CREATE TABLE IF NOT EXISTS tabletop_rooms(
      code TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
      active_player INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tabletop_players(
      code TEXT NOT NULL REFERENCES tabletop_rooms(code) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id), seat INTEGER NOT NULL,
      PRIMARY KEY(code,user_id), UNIQUE(code,seat));
    CREATE TABLE IF NOT EXISTS tabletop_cards(
      code TEXT NOT NULL REFERENCES tabletop_rooms(code) ON DELETE CASCADE,
      copy_id TEXT NOT NULL REFERENCES copies(id), user_id INTEGER NOT NULL REFERENCES users(id),
      zone TEXT NOT NULL DEFAULT 'hand' CHECK(zone IN ('hand','table')),
      face_up INTEGER NOT NULL DEFAULT 0, x INTEGER NOT NULL DEFAULT 0, y INTEGER NOT NULL DEFAULT 0,
      counters INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(code,copy_id));
    CREATE TABLE IF NOT EXISTS tabletop_actions(
      code TEXT NOT NULL REFERENCES tabletop_rooms(code) ON DELETE CASCADE,
      revision INTEGER NOT NULL, actor_id INTEGER NOT NULL REFERENCES users(id),
      description TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(code,revision));
    CREATE TABLE IF NOT EXISTS tabletop_practice(
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      step INTEGER NOT NULL DEFAULT 0, copy_id TEXT REFERENCES copies(id));
    """
    for statement in schema.split(";"):
        if statement.strip():
            db.execute(statement)


def _owned_cards(db, user_id, copy_ids):
    game.need(len(copy_ids) == 3 and len(set(copy_ids)) == 3, "Choose three different cards")
    cards = db.execute("SELECT id FROM copies WHERE owner_id=? AND id IN (?,?,?) AND listed=0",
                       (user_id, *copy_ids)).fetchall()
    game.need(len(cards) == 3, "Choose three available cards from your box", 403)


def practice_status(db, user_id):
    row = db.execute("SELECT step,copy_id FROM tabletop_practice WHERE user_id=?", (user_id,)).fetchone()
    step = row["step"] if row else 0
    return {"step": step, "completed": [name for name, _ in PRACTICE[:step]],
            "next_action": PRACTICE[step][0] if step < len(PRACTICE) else None,
            "copy_id": row["copy_id"] if row else None}


def practice_action(db, user_id, action, copy_id=None):
    current = practice_status(db, user_id)
    step = current["step"]
    game.need(step < len(PRACTICE), "Practice is complete", 409)
    expected, design_id = PRACTICE[step]
    game.need(action == expected, f"Try {expected} next")
    if step == 0:
        game.need(copy_id, "Choose a card to practice with")
        owned = db.execute("SELECT 1 FROM copies WHERE id=? AND owner_id=? AND listed=0", (copy_id, user_id)).fetchone()
        game.need(owned is not None, "Choose a card from your box", 403)
        db.execute("INSERT INTO tabletop_practice(user_id,step,copy_id) VALUES(?,?,?)", (user_id, 0, copy_id))
    else:
        game.need(current["copy_id"] is not None, "Place a card first")
    db.execute("UPDATE tabletop_practice SET step=? WHERE user_id=?", (step + 1, user_id))
    reward_id = game.mint_copy(db, design_id, user_id, origin_id=f"tabletop-practice:{expected}")
    return {"practice": practice_status(db, user_id), "reward_copy_id": reward_id, "reward_design_id": design_id}


def _room_code(db):
    for _ in range(12):
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if not db.execute("SELECT 1 FROM tabletop_rooms WHERE code=?", (code,)).fetchone():
            return code
    raise game.GameError("Could not create a room; try again", 503)


def _add_player(db, code, user_id, seat, copy_ids):
    _owned_cards(db, user_id, copy_ids)
    db.execute("INSERT INTO tabletop_players(code,user_id,seat) VALUES(?,?,?)", (code, user_id, seat))
    for card_id in copy_ids:
        db.execute("INSERT INTO tabletop_cards(code,copy_id,user_id) VALUES(?,?,?)", (code, card_id, user_id))


def create_room(db, user_id, copy_ids):
    code = _room_code(db)
    db.execute("INSERT INTO tabletop_rooms(code,created_at) VALUES(?,?)", (code, game.stamp()))
    _add_player(db, code, user_id, 0, copy_ids)
    return room_state(db, user_id, code)


def join_room(db, user_id, code, copy_ids):
    code = code.upper().strip()
    room = db.execute("SELECT 1 FROM tabletop_rooms WHERE code=?", (code,)).fetchone()
    game.need(room is not None, "Room not found", 404)
    players = db.execute("SELECT user_id FROM tabletop_players WHERE code=?", (code,)).fetchall()
    game.need(not any(row[0] == user_id for row in players), "Already in this room", 409)
    game.need(len(players) == 1, "Room is full", 409)
    _add_player(db, code, user_id, 1, copy_ids)
    _record(db, code, user_id, "joined the table")
    return room_state(db, user_id, code)


def _record(db, code, user_id, description):
    db.execute("UPDATE tabletop_rooms SET revision=revision+1 WHERE code=?", (code,))
    revision = db.execute("SELECT revision FROM tabletop_rooms WHERE code=?", (code,)).fetchone()[0]
    db.execute("INSERT INTO tabletop_actions VALUES(?,?,?,?,?)", (code, revision, user_id, description, game.stamp()))


def room_state(db, user_id, code):
    code = code.upper().strip()
    room = db.execute("SELECT * FROM tabletop_rooms WHERE code=?", (code,)).fetchone()
    game.need(room is not None, "Room not found", 404)
    players = [dict(row) for row in db.execute("SELECT p.user_id,p.seat,u.username FROM tabletop_players p JOIN users u ON u.id=p.user_id WHERE p.code=? ORDER BY p.seat", (code,))]
    viewer = next((p for p in players if p["user_id"] == user_id), None)
    game.need(viewer is not None, "This is a private room", 403)
    cards = []
    for row in db.execute("SELECT * FROM tabletop_cards WHERE code=? ORDER BY user_id,copy_id", (code,)):
        card = dict(row)
        visible = card["user_id"] == user_id or card["zone"] == "table" and bool(card["face_up"])
        card["card"] = game.copy_detail(db, card["copy_id"], user_id, age=False) if visible else None
        if not visible:
            card["copy_id"] = None
        cards.append(card)
    log = [dict(row) for row in db.execute("SELECT a.revision,a.actor_id,u.username actor,a.description,a.created_at FROM tabletop_actions a JOIN users u ON u.id=a.actor_id WHERE a.code=? ORDER BY a.revision DESC LIMIT 30", (code,))]
    return {"code": code, "revision": room["revision"], "active_player": room["active_player"],
            "seat": viewer["seat"], "players": players, "cards": cards, "log": log[::-1]}


def room_action(db, user_id, code, expected_revision, action, copy_id=None, x=None, y=None, value=None):
    code = code.upper().strip()
    room = db.execute("SELECT * FROM tabletop_rooms WHERE code=?", (code,)).fetchone()
    game.need(room is not None, "Room not found", 404)
    player = db.execute("SELECT seat FROM tabletop_players WHERE code=? AND user_id=?", (code, user_id)).fetchone()
    game.need(player is not None, "This is a private room", 403)
    game.need(room["revision"] == expected_revision, "The table changed; refresh and try again", 409)
    game.need(db.execute("SELECT COUNT(*) FROM tabletop_players WHERE code=?", (code,)).fetchone()[0] == 2,
              "Waiting for a second player")
    game.need(room["active_player"] == player["seat"], "Wait for your turn")
    if action == "pass":
        db.execute("UPDATE tabletop_rooms SET active_player=1-active_player WHERE code=?", (code,))
        description = "passed the turn"
    else:
        card = db.execute("SELECT * FROM tabletop_cards WHERE code=? AND copy_id=? AND user_id=?", (code, copy_id, user_id)).fetchone()
        game.need(card is not None, "Choose one of your cards", 403)
        if action == "place":
            game.need(card["zone"] == "hand", "Card is already on the table")
            game.need(type(x) is int and type(y) is int and 0 <= x <= 4 and 0 <= y <= 2, "Invalid table position")
            db.execute("UPDATE tabletop_cards SET zone='table',face_up=1,x=?,y=? WHERE code=? AND copy_id=?", (x, y, code, copy_id))
            description = "placed a card"
        elif action == "move":
            game.need(card["zone"] == "table", "Card is in your hand")
            game.need(type(x) is int and type(y) is int and 0 <= x <= 4 and 0 <= y <= 2, "Invalid table position")
            db.execute("UPDATE tabletop_cards SET x=?,y=? WHERE code=? AND copy_id=?", (x, y, code, copy_id))
            description = "moved a card"
        elif action == "flip":
            game.need(card["zone"] == "table", "Place the card first")
            db.execute("UPDATE tabletop_cards SET face_up=1-face_up WHERE code=? AND copy_id=?", (code, copy_id))
            description = "flipped a card"
        elif action == "counter":
            game.need(card["zone"] == "table", "Place the card first")
            game.need(type(value) is int and value in (-1, 1), "Counter change must be +1 or -1")
            game.need(0 <= card["counters"] + value <= 99, "Counter limit reached")
            db.execute("UPDATE tabletop_cards SET counters=counters+? WHERE code=? AND copy_id=?", (value, code, copy_id))
            description = "changed a counter"
        elif action == "hand":
            db.execute("UPDATE tabletop_cards SET zone='hand',face_up=0,counters=0 WHERE code=? AND copy_id=?", (code, copy_id))
            description = "returned a card to hand"
        else:
            raise game.GameError("Unknown table action")
    _record(db, code, user_id, description)
    return room_state(db, user_id, code)
