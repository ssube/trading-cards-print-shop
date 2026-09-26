"""Server-authoritative, short spark matches using printed card rules."""
import json
import random
import secrets
from datetime import timedelta

from . import game

FORMATS = {"starter": {"goal": 5, "turns": 16}, "intermediate": {"goal": 7, "turns": 22}, "challenge": {"goal": 10, "turns": 30}}
LANES = (0, 0, 1, 2, 2)
LANE_NAMES = ("Forge", "Spotlight", "Archive")
TURN_SECONDS = 40
BOT = -1
REWARD_MATCHES_PER_DAY = 3
CARD_REWARDS_PER_DAY = 1
CARD_POOL = ("tabletop-opening-hand", "tabletop-counter-keeper", "tabletop-playmaker", "fish-lanternfin", "mill-roller")


def init_tables(db):
    db.execute("CREATE TABLE IF NOT EXISTS tcg_matches(code TEXT PRIMARY KEY, creator_id INTEGER NOT NULL REFERENCES users(id), guest_id INTEGER REFERENCES users(id), mode TEXT NOT NULL, format TEXT NOT NULL, state_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
    db.execute("CREATE INDEX IF NOT EXISTS tcg_matches_creator ON tcg_matches(creator_id,updated_at)")
    db.execute("CREATE INDEX IF NOT EXISTS tcg_matches_guest ON tcg_matches(guest_id,updated_at)")
    db.execute("CREATE TABLE IF NOT EXISTS tcg_rewards(code TEXT NOT NULL REFERENCES tcg_matches(code), user_id INTEGER NOT NULL REFERENCES users(id), day TEXT NOT NULL, resources_json TEXT NOT NULL, copy_id TEXT, PRIMARY KEY(code,user_id))")


def _code(db):
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db.execute("SELECT 1 FROM tcg_matches WHERE code=?", (code,)).fetchone():
            return code
    raise game.GameError("Could not open a match; try again", 503)


def _print_value(db, card):
    cost = game.print_cost(db, card["rule_ids"], card["finish_id"], card["border_id"], card["back_id"], card["back_finish_id"])
    return cost.get("paper", 0) + cost.get("ink", 0) + 2 * cost.get("foil", 0)


def _deck(db, user_id, copy_ids):
    game.need(isinstance(copy_ids, list) and 6 <= len(copy_ids) <= 12 and len(copy_ids) == len(set(copy_ids)), "Choose 6 to 12 different copies")
    cards = []
    for copy_id in copy_ids:
        card = game.copy_detail(db, copy_id, user_id, age=False)
        game.need(card["owner_id"] == user_id and not card["listed"], "Choose available cards from your box", 403)
        game.need("sleeved" not in card["rule_ids"], "This card has an old rule; refresh your collection", 409)
        cards.append({"id": copy_id, "name": card["name"], "art_path": card["art_path"], "type_id": card["type_id"], "rule_ids": card["rule_ids"], "rule_text": card["rule_text"], "finish_id": card["finish_id"], "border_id": card["border_id"], "back_id": card["back_id"], "back_finish_id": card["back_finish_id"], "guard": 2 if card["type_id"] != "spell" else 1, "max_guard": 2 if card["type_id"] != "spell" else 1, "zone": "deck", "slot": None, "attacked": False, "staged_turn": None})
    game.need(any(c["type_id"] == "monster" for c in cards), "Bring at least one Monster")
    return cards, sum(_print_value(db, c) for c in cards)


def _seat(user_id, cards, value):
    random.shuffle(cards)
    for card in cards[:3]:
        card["zone"] = "hand"
    return {"user_id": user_id, "cards": cards, "value": value, "sparks": 0, "timeouts": 0, "spell_played": False, "effect_history": [], "triggered": [], "peek": None}


def _new_state(code, mode, format_id, host):
    return {"code": code, "mode": mode, "format": format_id, "goal": FORMATS[format_id]["goal"], "turn_limit": FORMATS[format_id]["turns"], "status": "waiting", "revision": 0, "active_seat": 0, "turn": 0, "actions_left": 2, "deadline": None, "winner": None, "players": [host], "log": [], "rewards": {}}


def _log(s, text):
    s["revision"] += 1
    s["log"].append({"revision": s["revision"], "text": text})
    s["log"] = s["log"][-50:]


def _save(db, s):
    db.execute("UPDATE tcg_matches SET state_json=?,updated_at=? WHERE code=?", (json.dumps(s), game.stamp(), s["code"]))


def _load(db, code):
    row = db.execute("SELECT * FROM tcg_matches WHERE code=?", (code.upper().strip(),)).fetchone()
    game.need(row is not None, "Match not found", 404)
    return json.loads(row["state_json"])


def _view(s, user_id):
    seat = next((i for i, p in enumerate(s["players"]) if p["user_id"] == user_id), None)
    game.need(seat is not None, "This is a private match", 403)
    players = []
    for i, p in enumerate(s["players"]):
        cards = []
        for c in p["cards"]:
            if c["zone"] == "board" or i == seat and c["zone"] in ("hand", "discard"):
                cards.append(dict(c))
        players.append({"seat": i, "user_id": p["user_id"], "username": "Pressroom Bot" if p["user_id"] == BOT else p.get("username", "Player"), "sparks": p["sparks"], "deck_count": sum(c["zone"] == "deck" for c in p["cards"]), "hand_count": sum(c["zone"] == "hand" for c in p["cards"]), "discard_count": sum(c["zone"] == "discard" for c in p["cards"]), "cards": cards, "peek": next(({"id": c["id"], "name": c["name"]} for c in p["cards"] if c["id"] == p["peek"]), None) if i == seat else None})
    return {k: s[k] for k in ("code", "mode", "format", "goal", "turn_limit", "status", "revision", "active_seat", "turn", "actions_left", "deadline", "winner", "log", "rewards")} | {"seat": seat, "players": players, "lanes": list(LANE_NAMES)}


def create(db, user_id, username, copy_ids, format_id="starter", bot=False):
    game.need(format_id in FORMATS, "Unknown match format")
    cards, value = _deck(db, user_id, copy_ids)
    game.need(len(cards) == {"starter": 6, "intermediate": 8, "challenge": 12}[format_id], "Choose the exact number of cards for this format")
    code = _code(db)
    host = _seat(user_id, cards, value)
    host["username"] = username
    s = _new_state(code, "bot" if bot else "pvp", format_id, host)
    if bot:
        # Same designs and count, with independent copies and a fresh shuffle.
        bot_cards = [{**c, "id": f"bot-{i}-{code}", "zone": "deck", "slot": None, "attacked": False, "staged_turn": None} for i, c in enumerate(cards)]
        s["players"].append(_seat(BOT, bot_cards, value))
        _start(s)
    db.execute("INSERT INTO tcg_matches(code,creator_id,guest_id,mode,format,state_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)", (code, user_id, None, s["mode"], format_id, json.dumps(s), game.stamp(), game.stamp()))
    return _view(s, user_id)


def join(db, user_id, username, code, copy_ids):
    s = _load(db, code)
    game.need(s["status"] == "waiting" and s["mode"] == "pvp", "Match is no longer waiting", 409)
    game.need(s["players"][0]["user_id"] != user_id, "You opened this match", 409)
    cards, value = _deck(db, user_id, copy_ids)
    host = s["players"][0]
    difference = abs(len(cards) - len(host["cards"]))
    ratio = abs(value - host["value"]) / max(1, host["value"])
    game.need(difference <= 2 or ratio <= .25, "Bring a deck within two cards or 25% print cost of the host's deck")
    guest = _seat(user_id, cards, value)
    guest["username"] = username
    s["players"].append(guest)
    _start(s)
    db.execute("UPDATE tcg_matches SET guest_id=? WHERE code=?", (user_id, s["code"]))
    _save(db, s)
    return _view(s, user_id)


def _start(s):
    s["status"] = "active"
    s["deadline"] = (game.now() + timedelta(seconds=TURN_SECONDS)).isoformat()
    s["turn"] = 1
    _log(s, f"Match started. First to {s['goal']} sparks wins.")
    _draw(s, 0)


def _draw(s, seat):
    p = s["players"][seat]
    if sum(c["zone"] == "hand" for c in p["cards"]) >= 5:
        return
    deck = [c for c in p["cards"] if c["zone"] == "deck"]
    if not deck:
        # A printed shuffle skill refills deliberately; no automatic reshuffle.
        return
    card = deck[0]
    card["zone"] = "hand"
    p["peek"] = None
    _trigger(s, seat, card, "on_draw")


def _effect(s, seat, source, effect, echo=False):
    p = s["players"][seat]
    enemy = s["players"][1 - seat]
    source_name = source["name"] if source["zone"] == "board" else "A drawn card"
    if effect == "draw":
        _draw(s, seat)
    elif effect == "grow":
        p["sparks"] += 1
        _log(s, f"{source_name} gained a spark.")
    elif effect == "mend":
        damaged = [c for c in p["cards"] if c["zone"] == "board" and c["guard"] < c["max_guard"]]
        if damaged:
            chosen = sorted(damaged, key=lambda c: (c["guard"], c["slot"]))[0]
            chosen["guard"] += 1
            _log(s, f"{source_name} mended {chosen['name']}.")
    elif effect == "glimpse":
        next_card = next((c for c in p["cards"] if c["zone"] == "deck"), None)
        p["peek"] = next_card["id"] if next_card else None
    elif effect == "return":
        lane = LANES[source["slot"]] if source["slot"] is not None else None
        candidates = [c for c in enemy["cards"] if c["zone"] == "board" and (lane is None or LANES[c["slot"]] == lane)]
        if candidates:
            chosen = sorted(candidates, key=lambda c: c["slot"])[0]
            chosen.update(zone="hand", slot=None, guard=chosen["max_guard"], staged_turn=None)
            _log(s, f"{source_name} returned {chosen['name']} to hand.")
    elif effect == "shuffle":
        to_mix = [c for c in p["cards"] if c["zone"] in ("deck", "discard")]
        random.shuffle(to_mix)
        for c in to_mix:
            c["zone"] = "deck"
        p["cards"] = [c for c in p["cards"] if c not in to_mix] + to_mix
        p["peek"] = None
        _log(s, f"{source_name} shuffled the discard into the deck.")
    elif effect == "echo" and not echo:
        previous = next((item for item in reversed(p["effect_history"]) if item[0] != source["id"] and item[1] != "echo"), None)
        if previous:
            _effect(s, seat, source, previous[1], echo=True)
    if effect != "echo" and not echo:
        p["effect_history"].append([source["id"], effect])
    _finish_if_goal(s)


def _trigger(s, seat, card, trigger):
    if s["status"] != "active" or trigger not in card["rule_ids"]:
        return
    p = s["players"][seat]
    key = f"{s['turn']}:{card['id']}:{trigger}"
    if key in p["triggered"]:
        return
    p["triggered"].append(key)
    conditions = set(card["rule_ids"])
    if "if_land" in conditions and not any(c["zone"] == "board" and c["type_id"] == "land" for c in p["cards"]):
        return
    if "if_monster" in conditions and not any(c["zone"] == "board" and c["type_id"] == "monster" for c in p["cards"]):
        return
    if "if_spell" in conditions and not p["spell_played"]:
        return
    effect = next((r for r in card["rule_ids"] if r in {"draw", "grow", "mend", "glimpse", "return", "echo", "shuffle"}), None)
    if effect:
        _effect(s, seat, card, effect)


def _finish_if_goal(s):
    if s["status"] != "active":
        return
    for i, p in enumerate(s["players"]):
        if p["sparks"] >= s["goal"]:
            s["status"] = "finished"
            s["winner"] = i
            s["deadline"] = None
            _log(s, f"{p.get('username', 'Pressroom Bot')} reached {s['goal']} sparks.")
            return


def _end_turn(s, timeout=False):
    if s["status"] != "active":
        return
    seat = s["active_seat"]
    p = s["players"][seat]
    for card in sorted(p["cards"], key=lambda item: item["slot"] if item["slot"] is not None else 99):
        if card["zone"] == "board" and card["type_id"] != "spell":
            _trigger(s, seat, card, "dusk")
            if s["status"] != "active":
                return
    if timeout:
        p["timeouts"] += 1
        _log(s, f"{p.get('username', 'Pressroom Bot')} ran out of time.")
        if p["timeouts"] >= 2:
            s["status"] = "finished"
            s["winner"] = 1 - seat
            s["deadline"] = None
            _log(s, "Match ended after two missed turns.")
            return
    else:
        p["timeouts"] = 0
    if s["turn"] >= s["turn_limit"]:
        a, b = s["players"]
        s["status"] = "finished"
        s["winner"] = 0 if a["sparks"] > b["sparks"] else 1 if b["sparks"] > a["sparks"] else None
        s["deadline"] = None
        _log(s, "Turn limit reached; sparks decide the match.")
        return
    s["active_seat"] = 1 - seat
    s["turn"] += 1
    s["actions_left"] = 2
    active = s["players"][s["active_seat"]]
    active["effect_history"] = []
    active["triggered"] = []
    active["spell_played"] = False
    for card in active["cards"]:
        card["attacked"] = False
    s["deadline"] = (game.now() + timedelta(seconds=TURN_SECONDS)).isoformat()
    _draw(s, s["active_seat"])
    for card in sorted(active["cards"], key=lambda item: item["slot"] if item["slot"] is not None else 99):
        if card["zone"] == "board" and card["type_id"] != "spell":
            _trigger(s, s["active_seat"], card, "dawn")
    _log(s, f"Turn {s['turn']} began.")


def _act(s, seat, action, copy_id=None, slot=None):
    game.need(s["status"] == "active", "Match is not active", 409)
    game.need(s["active_seat"] == seat, "Wait for your turn", 409)
    if action == "pass":
        _end_turn(s)
        return
    game.need(s["actions_left"] > 0, "No actions left")
    p = s["players"][seat]
    enemy = s["players"][1 - seat]
    card = next((c for c in p["cards"] if c["id"] == copy_id), None)
    game.need(card is not None, "Choose one of your cards", 403)
    if action == "place":
        game.need(card["zone"] == "hand", "Card is not in your hand")
        game.need(type(slot) is int and 0 <= slot < 5, "Choose a board slot")
        game.need(not any(c["zone"] == "board" and c["slot"] == slot for c in p["cards"]), "Slot is occupied")
        card.update(zone="board", slot=slot, staged_turn=s["turn"] if card["type_id"] == "spell" else None)
        if card["type_id"] == "spell":
            p["spell_played"] = True
        elif card["type_id"] == "land" and LANES[slot] == 2:
            card["guard"] += 1
            card["max_guard"] += 1
        _log(s, f"{p.get('username', 'Pressroom Bot')} placed {card['name']} in {LANE_NAMES[LANES[slot]]}.")
        if card["type_id"] != "spell":
            _trigger(s, seat, card, "arrival")
    elif action == "activate":
        game.need(card["zone"] == "board" and card["type_id"] == "spell", "Place a Spell first")
        p["spell_played"] = True
        _trigger(s, seat, card, "arrival")
        # Spells always resolve their printed effect when activated, including
        # cards made with a different trigger. The trigger still works on draw.
        if "arrival" not in card["rule_ids"]:
            effect = next((r for r in card["rule_ids"] if r in {"draw", "grow", "mend", "glimpse", "return", "echo", "shuffle"}), None)
            if effect:
                _effect(s, seat, card, effect)
        activated_lane = LANES[card["slot"]]
        card.update(zone="discard", slot=None, staged_turn=None)
        _log(s, f"{card['name']} activated and went to discard.")
        if activated_lane == 1:
            _draw(s, seat)
    elif action == "attack":
        game.need(card["zone"] == "board" and card["type_id"] == "monster", "Only a Monster on the board can attack")
        game.need(not card["attacked"], "This Monster already attacked this turn")
        lane = LANES[card["slot"]]
        targets = [c for c in enemy["cards"] if c["zone"] == "board" and LANES[c["slot"]] == lane]
        if targets:
            target = sorted(targets, key=lambda c: c["slot"])[0]
            target["guard"] -= 2 if lane == 0 else 1
            _log(s, f"{card['name']} struck {target['name']}.")
            if target["guard"] <= 0:
                target.update(zone="discard", slot=None, guard=target["max_guard"], staged_turn=None)
                _log(s, f"{target['name']} went to discard.")
        else:
            enemy_gain = 2 if lane == 1 else 1
            p["sparks"] += enemy_gain
            _log(s, f"{card['name']} scored {enemy_gain} spark{'s' if enemy_gain > 1 else ''}.")
        card["attacked"] = True
        _finish_if_goal(s)
    elif action == "move":
        game.need(card["zone"] == "board", "Place the card first")
        game.need(type(slot) is int and 0 <= slot < 5, "Choose a board slot")
        game.need(not any(c["zone"] == "board" and c["slot"] == slot for c in p["cards"]), "Slot is occupied")
        card["slot"] = slot
        _log(s, f"{card['name']} moved to {LANE_NAMES[LANES[slot]]}.")
    else:
        raise game.GameError("Unknown match action")
    s["actions_left"] -= 1
    if s["status"] == "active" and s["actions_left"] == 0:
        _end_turn(s)


def _bot_turn(s):
    count = 0
    while s["status"] == "active" and s["active_seat"] == 1 and count < 5:
        count += 1
        p = s["players"][1]
        enemy = s["players"][0]
        attacks = [c for c in p["cards"] if c["zone"] == "board" and c["type_id"] == "monster" and not c["attacked"]]
        attacks.sort(key=lambda c: (bool([e for e in enemy["cards"] if e["zone"] == "board" and LANES[e["slot"]] == LANES[c["slot"]]]), LANES[c["slot"]] != 1))
        staged = next((c for c in p["cards"] if c["zone"] == "board" and c["type_id"] == "spell"), None)
        free = [i for i in range(5) if not any(c["zone"] == "board" and c["slot"] == i for c in p["cards"])]
        hand = [c for c in p["cards"] if c["zone"] == "hand"]
        if attacks:
            _act(s, 1, "attack", attacks[0]["id"])
        elif staged:
            _act(s, 1, "activate", staged["id"])
        elif hand and free:
            hand.sort(key=lambda c: {"monster": 0, "land": 1, "spell": 2}[c["type_id"]])
            card = hand[0]
            preferred = {"monster": (2, 0, 1, 3, 4), "land": (3, 4, 0, 1, 2), "spell": (2, 1, 0, 3, 4)}[card["type_id"]]
            _act(s, 1, "place", card["id"], next(i for i in preferred if i in free))
        else:
            _end_turn(s)


def _tick(s):
    if s["status"] != "active":
        return
    from datetime import datetime
    while s["status"] == "active" and s["deadline"] and game.now() >= datetime.fromisoformat(s["deadline"]):
        _end_turn(s, timeout=True)
    if s["mode"] == "bot" and s["status"] == "active" and s["active_seat"] == 1:
        _bot_turn(s)


def _award(db, s):
    if s["status"] != "finished" or s["rewards"]:
        return
    for seat, p in enumerate(s["players"]):
        user_id = p["user_id"]
        if user_id == BOT:
            continue
        today = game.day()
        used = db.execute("SELECT COUNT(*) FROM tcg_rewards WHERE user_id=? AND day=?", (user_id, today)).fetchone()[0]
        reward = {"resources": {}, "copy_id": None}
        if used < REWARD_MATCHES_PER_DAY:
            paper = 1 + min(3, p["sparks"] // 2)
            ink = min(3, p["sparks"] // 3) + int(s["winner"] == seat)
            if s["mode"] == "bot":
                paper = max(1, paper - 1)
                ink = max(0, ink - 1)
            reward["resources"] = {"paper": paper, "ink": ink}
            game.adjust_resources(db, user_id, reward["resources"])
            cards_today = db.execute("SELECT COUNT(*) FROM tcg_rewards WHERE user_id=? AND day=? AND copy_id IS NOT NULL", (user_id, today)).fetchone()[0]
            if s["winner"] == seat and cards_today < CARD_REWARDS_PER_DAY and secrets.randbelow(100) < min(65, 10 + 5 * p["sparks"]):
                design_id = CARD_POOL[secrets.randbelow(len(CARD_POOL))]
                reward["copy_id"] = game.mint_copy(db, design_id, user_id, origin_id=f"tcg:{s['code']}")
                reward["design_id"] = design_id
        db.execute("INSERT INTO tcg_rewards(code,user_id,day,resources_json,copy_id) VALUES(?,?,?,?,?)", (s["code"], user_id, today, json.dumps(reward["resources"]), reward["copy_id"]))
        s["rewards"][str(seat)] = reward


def state(db, user_id, code):
    s = _load(db, code)
    _view(s, user_id)
    before = s["revision"]
    _tick(s)
    _award(db, s)
    if s["revision"] != before or s["status"] == "finished":
        _save(db, s)
    return _view(s, user_id)


def action(db, user_id, code, revision, kind, copy_id=None, slot=None):
    s = _load(db, code)
    view = _view(s, user_id)
    _tick(s)
    game.need(s["revision"] == revision, "Match changed; refresh and try again", 409)
    _act(s, view["seat"], kind, copy_id, slot)
    if s["mode"] == "bot":
        _bot_turn(s)
    _award(db, s)
    _save(db, s)
    return _view(s, user_id)


def recent(db, user_id):
    rows = db.execute("SELECT code FROM tcg_matches WHERE creator_id=? OR guest_id=? ORDER BY updated_at DESC LIMIT 8", (user_id, user_id)).fetchall()
    return [state(db, user_id, row["code"]) for row in rows]
