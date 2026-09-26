import hashlib
import json
import math
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta

from .db import connect, transaction


class GameError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status
        super().__init__(message)


def now():
    return datetime.now(timezone.utc)


def stamp():
    return now().isoformat()


def day():
    return now().date().isoformat()


def uid():
    return uuid.uuid4().hex


def obj(row):
    return dict(row) if row else None


def need(condition, message, status=400):
    if not condition:
        raise GameError(message, status)


PARTS = [
    ("land", "type", "Land", "A place with a stubborn opinion.", 0),
    ("monster", "type", "Monster", "A creature ready for a future battle.", 0),
    ("spell", "type", "Spell", "A moment of concentrated mischief.", 0),
    ("arrival", "rule", "On arrival", "When this enters play", 1),
    ("dusk", "rule", "At dusk", "At the end of a turn", 1),
    ("sleeved", "rule", "While protected", "While this card is protected", 1),
    ("if_land", "rule", "If you control a land", "If you control a land", 1),
    ("draw", "rule", "Draw a card", "Draw one card", 2),
    ("grow", "rule", "Gain a spark", "Gain one spark", 2),
    ("echo", "rule", "Echo a skill", "Repeat another skill once", 3),
    ("dawn", "rule", "At dawn", "At the start of a turn", 1),
    ("on_draw", "rule", "When you draw", "When you draw a card", 1),
    ("if_monster", "rule", "If you control a Monster", "If you control a Monster", 1),
    ("if_spell", "rule", "If you played a Spell", "If you played a Spell this turn", 1),
    ("mend", "rule", "Restore a spark", "Restore one spark to a chosen card", 2),
    ("glimpse", "rule", "Glimpse ahead", "Look at the next card in your deck", 2),
    ("return", "rule", "Return a card", "Return a card to its owner's hand", 2),
    ("storybook", "theme", "Storybook", "Painterly magic and gentle oddities.", 0),
    ("celestial", "theme", "Celestial", "Stars, instruments, and impossible skies.", 0),
    ("absurd", "theme", "Absurdist", "A very serious illustration of a silly idea.", 0),
    ("botanical", "theme", "Botanical", "Enchanted gardens, living paper, and gentle wilds.", 0),
    ("clockwork", "theme", "Clockwork", "Brass mechanisms and curious inventions.", 0),
    ("maritime", "theme", "Maritime", "Tidal magic, sea glass, and impossible harbors.", 0),
    ("infernal", "theme", "Infernal", "Furnace light, ember dust, and haunted machinery.", 0),
    ("standard", "finish", "Standard", "Soft matte print.", 0),
    ("shimmer", "finish", "Shimmer", "A narrow, shifting foil gleam.", 0),
    ("holo", "finish", "Full Holo", "An extravagant prismatic surface.", 0),
    ("etched", "finish", "Etched Silver", "Fine metallic lines catch the light.", 0),
    ("starfield", "finish", "Starfield", "Tiny points of light glint across the card.", 0),
    ("confetti", "finish", "Confetti", "Scattered metallic color catches the light.", 0),
    ("glitter", "finish", "Glitter", "Dense, scattered foil flecks sparkle as the card moves.", 0),
    ("aurora", "finish", "Aurora", "Soft waves of green and violet light.", 0),
    ("spooky", "finish", "Spooky", "Ghostly shapes drift through a cold, violet haze.", 0),
    ("pumpkin", "finish", "Pumpkin Spice", "Copper and amber light catches scattered autumn leaves.", 0),
    ("crashout", "finish", "Crashout", "Candy-bright ribbons collide in an electric pink shimmer.", 0),
    ("classic", "border", "Classic Gilt", "Warm paper and a gilt frame.", 0),
    ("starlit", "border", "Starlit Filigree", "A midnight frame traced with stars.", 0),
    ("velvet", "border", "Velvet Scrollwork", "A rose and ink ornamental frame.", 0),
    ("archive", "back", "Archive Seal", "The original press seal.", 0),
    ("atlas", "back", "Atlas Compass", "A compass for impossible places.", 0),
    ("mischief", "back", "Fox Masquerade", "A playful mark from the Foil Fox.", 0),
]
STARTER_DECKS = {
    "pressroom": {
        "name": "The Pressroom Parade", "theme": "Storybook workshop", "accent": "amber",
        "description": "A cheerful crew of paper and ink learns the craft one impression at a time.",
        "featured": "starter-press-cat", "cards": {"starter-press-cat": 1, "starter-press-cat-foil": 1, "starter-paper-sprite": 1},
    },
    "starlit": {
        "name": "The Starlit Atlas", "theme": "Celestial cartography", "accent": "blue",
        "description": "Follow unfinished constellations and print places that should not fit on a map.",
        "featured": "npc-starlit-map", "cards": {"npc-starlit-map": 1, "npc-starlit-map-foil": 1, "starter-paper-sprite": 1},
    },
    "velvet": {
        "name": "The Velvet Mischief", "theme": "Absurdist foil", "accent": "rose",
        "description": "A sly fox proves that a little mischief looks even better under foil.",
        "featured": "npc-foil-fox", "cards": {"npc-foil-fox": 1, "npc-foil-fox-standard": 1, "starter-paper-sprite": 1},
    },
}
RESOURCE_KINDS = {"paper", "ink", "sleeve", "foil"}
FINISH_COST = {"standard": 0, "shimmer": 1, "etched": 3, "starfield": 2,
               "glitter": 2, "aurora": 3, "spooky": 2, "pumpkin": 2, "confetti": 3, "holo": 3, "crashout": 3}
DESIGN_STYLES = {"npc-starlit-map": ("starlit", "atlas"),
                 "npc-foil-fox": ("velvet", "mischief"),
                 "npc-sunlit-note": ("starlit", "atlas"),
                 "npc-clockwork-heron": ("starlit", "atlas"),
                 "npc-tideglass-portal": ("starlit", "atlas")}
RULE_SLOTS = {"arrival": "trigger", "dusk": "trigger", "sleeved": "trigger", "if_land": "condition",
              "draw": "effect", "grow": "effect", "echo": "effect", "dawn": "trigger",
              "on_draw": "trigger", "if_monster": "condition", "if_spell": "condition",
              "mend": "effect", "glimpse": "effect", "return": "effect"}


def seed():
    with transaction() as db:
        for part in PARTS:
            db.execute("INSERT OR IGNORE INTO parts(id,kind,name,description,power) VALUES(?,?,?,?,?)", part)
        # Existing accounts predate learnable visual parts. Restore the styles
        # supplied by their original starter deck when seeding an upgraded world.
        for part_id, deck_id in (("classic", None), ("archive", None),
                                 ("starlit", "starlit"), ("atlas", "starlit"),
                                 ("velvet", "velvet"), ("mischief", "velvet")):
            if deck_id is None:
                db.execute("INSERT OR IGNORE INTO learned(user_id,part_id) SELECT id,? FROM users", (part_id,))
            else:
                db.execute("INSERT OR IGNORE INTO learned(user_id,part_id) "
                           "SELECT id,? FROM users WHERE starter_deck_id=?", (part_id, deck_id))
        for part_id, slot in RULE_SLOTS.items():
            db.execute("UPDATE parts SET slot=? WHERE id=?", (slot, part_id))
        for part_id, foil in FINISH_COST.items():
            db.execute("UPDATE parts SET cost_json=? WHERE id=? AND kind='finish'", (json.dumps({"foil": foil}), part_id))
        for part_id, cost in {"starlit": {"ink": 1}, "velvet": {"ink": 1},
                              "atlas": {"ink": 1}, "mischief": {"ink": 1, "foil": 1}}.items():
            db.execute("UPDATE parts SET cost_json=? WHERE id=? AND kind IN ('border','back')",
                       (json.dumps(cost), part_id))
        from .providers import bundled_art, demo_art
        npc_designs = [
            ("starter-press-cat", "Apprentice Press Cat", "He insists every proof needs one more paw print.",
             "monster", ["arrival", "draw"], "storybook", "standard"),
            ("starter-paper-sprite", "Paper Sprite's First Drop", "Every great edition begins with a borrowed drop.",
             "spell", ["arrival", "draw"], "storybook", "standard"),
            ("npc-starlit-map", "The Map of Unfinished Constellations", "A place for every star, except the one you're looking for.",
             "land", ["dusk", "grow"], "celestial", "standard"),
            ("npc-foil-fox", "The Foil Fox", "The trick was never the shine. It was where you looked.",
             "monster", ["sleeved", "echo"], "absurd", "shimmer"),
            ("npc-sunlit-note", "A Note from the Sun", "Please return the moon by Thursday.",
             "spell", ["arrival", "draw"], "celestial", "holo"),
            ("npc-borrowed-dawn", "The Orchard of Borrowed Dawn", "The fruit ripens only when someone needs another morning.",
             "land", ["dawn", "if_land", "mend"], "botanical", "standard"),
            ("npc-clockwork-heron", "The Clockwork Heron", "It remembers tomorrow's stars better than yesterday's roads.",
             "monster", ["on_draw", "if_monster", "glimpse"], "clockwork", "shimmer"),
            ("npc-tideglass-portal", "The Tideglass Portal", "Every shore has a door that the tide remembers.",
             "spell", ["arrival", "if_spell", "return"], "maritime", "standard"),
            ("mill-apprentice", "The Pulp Apprentice", "Her first proof has only three paw prints.",
             "monster", ["arrival", "draw"], "storybook", "standard"),
            ("mill-roller", "The Moonlit Roller", "All night it turns; by morning, every page is softer.",
             "land", ["dusk", "grow"], "clockwork", "shimmer"),
            ("mill-master", "Master of the Midnight Mill", "A spotless apron is the surest sign of management.",
             "monster", ["sleeved", "echo"], "storybook", "standard"),
            ("fish-lanternfin", "Lanternfin", "Its light arrives a moment before the fish does.",
             "monster", ["arrival", "glimpse"], "maritime", "standard"),
            ("fish-inkscale", "Inkscale", "Every ripple writes a new sentence.",
             "monster", ["on_draw", "draw"], "maritime", "shimmer"),
            ("fish-moonkoi", "Moon Koi", "The pond insists the moon is one of its fish.",
             "monster", ["dusk", "grow"], "maritime", "standard"),
            ("demon-cinderlord", "Cinderlord of the Press", "Even the furnace asks for a day off.",
             "monster", ["arrival", "grow"], "infernal", "standard"),
            ("demon-ashwarden", "Ashwarden's Gate", "Its hinges were cast from yesterday's excuses.",
             "land", ["dusk", "mend"], "infernal", "shimmer"),
            ("demon-pressfiend", "The Pressfiend's Bargain", "Read the fine print. Then read it again.",
             "spell", ["arrival", "return"], "infernal", "standard"),
            ("tabletop-opening-hand", "The Opening Hand", "A table is an invitation waiting for its first card.",
             "spell", ["arrival", "draw"], "absurd", "standard"),
            ("tabletop-counter-keeper", "The Counter Keeper", "Every number is official if you say it confidently.",
             "monster", ["on_draw", "grow"], "clockwork", "shimmer"),
            ("tabletop-playmaker", "The Playmaker's Table", "Its oldest rule is to make room for another player.",
             "land", ["dusk", "mend"], "storybook", "standard"),
        ]
        # Finish variants share their featured card's artwork and text.
        variants = {"starter-press-cat": ("starter-press-cat-foil", "shimmer"),
                    "npc-starlit-map": ("npc-starlit-map-foil", "shimmer"),
                    "npc-foil-fox": ("npc-foil-fox-standard", "standard")}
        for did, name, flavor, type_id, rules, theme, finish in npc_designs:
            bundled = bundled_art(did)
            border, back = DESIGN_STYLES.get(did, ("classic", "archive"))
            if not db.execute("SELECT 1 FROM designs WHERE id=?", (did,)).fetchone():
                art = bundled or demo_art(did, theme, name)
                db.execute("INSERT INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id) "
                           "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                           (did, None, type_id, json.dumps(rules), theme, finish, name, flavor, art, stamp(), border, back))
            else:
                db.execute("UPDATE designs SET border_id=?,back_id=? WHERE id=?", (border, back, did))
                if bundled:
                    db.execute("UPDATE designs SET art_path=? WHERE id=?", (bundled, did))
            if did.startswith(("fish-", "mill-", "demon-", "tabletop-")):
                # Replace older generic demo art when a world is upgraded.
                db.execute("UPDATE designs SET art_path=? WHERE id=?", (demo_art(did, theme, name), did))
            if did in variants:
                variant_id, variant_finish = variants[did]
                if not db.execute("SELECT 1 FROM designs WHERE id=?", (variant_id,)).fetchone():
                    db.execute("INSERT INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id) "
                               "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                               (variant_id, None, type_id, json.dumps(rules), theme, variant_finish,
                                name, flavor, bundled or demo_art(did, theme, name), stamp(), border, back))
                else:
                    db.execute("UPDATE designs SET border_id=?,back_id=? WHERE id=?", (border, back, variant_id))
                    if bundled:
                        db.execute("UPDATE designs SET art_path=? WHERE id=?", (bundled, variant_id))
        # Specimen editions let collectors study each finish without requiring an admin grant.
        for base_id, finish in (("starter-press-cat", "etched"), ("npc-starlit-map", "starfield"),
                                ("npc-foil-fox", "glitter"), ("npc-sunlit-note", "confetti"),
                                ("npc-tideglass-portal", "aurora"), ("demon-ashwarden", "spooky"),
                                ("npc-borrowed-dawn", "pumpkin"), ("npc-foil-fox", "crashout")):
            base = db.execute("SELECT * FROM designs WHERE id=?", (base_id,)).fetchone()
            db.execute("INSERT OR IGNORE INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id) "
                       "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                       (f"{base_id}-{finish}", None, base["type_id"], base["rule_ids"], base["theme_id"],
                        finish, base["name"], base["flavor"], base["art_path"], stamp(), base["border_id"], base["back_id"]))
        from .decks import seed_rewards
        seed_rewards(db)
        db.execute("UPDATE designs SET back_finish_id='shimmer' WHERE back_id='mischief' AND back_finish_id IS NULL")
        briefs = [
            ("first-edition", "First Edition", "Turn in any freshly printed card.", {"min_grade": 1}, {"paper": 3, "ink": 3}, 1, 1),
            ("land-survey", "The Cartographer", "A Land for the library's wandering map.", {"type": "land", "min_grade": 5}, {"paper": 4, "ink": 3}, 0, 1),
            ("sleeve-test", "The Careful Curator", "A sleeved Monster, safely delivered.", {"type": "monster", "sleeved": True, "min_grade": 5}, {"paper": 3, "ink": 4, "foil": 1}, 0, 1),
            ("slab-display", "The Glass Cabinet", "A certified card worthy of display.", {"slabbed": True, "min_grade": 8}, {"paper": 4, "ink": 4, "foil": 2, "sleeve": 1}, 0, 1),
        ]
        for cid, title, desc, req, reward, repeatable, daily in briefs:
            db.execute("INSERT OR IGNORE INTO commissions VALUES(?,?,?,?,?,?,?,1)",
                       (cid, title, desc, json.dumps(req), json.dumps(reward), repeatable, daily))
        offers = [
            ("ink-for-paper", "Pip the Inker", "Ink for spare paper", {"resources": {"paper": 3}}, {"resources": {"ink": 2}}),
            ("foil-for-monster", "Madam Moth", "Foil for a Monster", {"type": "monster", "min_grade": 6}, {"resources": {"foil": 2}}),
            ("sleeves-for-ink", "The Archivist", "Protect your collection", {"resources": {"ink": 3}}, {"resources": {"sleeve": 2}}),
            ("celestial-lesson", "Astrid the Binder", "A celestial lesson", {"resources": {"ink": 2}}, {"learn": "celestial"}),
            ("shimmer-lesson", "The Foil Fox", "The secret of shimmer", {"resources": {"paper": 3, "ink": 2}}, {"learn": "shimmer"}),
            ("holo-lesson", "The Foil Fox", "The full spectrum", {"resources": {"foil": 3}}, {"learn": "holo"}),
            ("etched-lesson", "Pip the Inker", "An etched impression", {"resources": {"foil": 1, "ink": 2}}, {"design_id": "starter-press-cat-etched"}),
            ("starfield-lesson", "Astrid the Binder", "A pocketful of stars", {"resources": {"foil": 2, "ink": 2}}, {"design_id": "npc-starlit-map-starfield"}),
            ("glitter-lesson", "The Foil Fox", "A little sparkle", {"resources": {"foil": 2, "paper": 2}}, {"design_id": "npc-foil-fox-glitter"}),
            ("confetti-lesson", "Madam Moth", "A celebration in color", {"resources": {"foil": 3, "ink": 2}}, {"design_id": "npc-sunlit-note-confetti"}),
            ("aurora-lesson", "Madam Moth", "The northern press", {"resources": {"foil": 2, "ink": 3}}, {"design_id": "npc-tideglass-portal-aurora"}),
            ("spooky-lesson", "The Archivist", "The haunted proof", {"resources": {"foil": 2, "paper": 2}}, {"design_id": "demon-ashwarden-spooky"}),
            ("pumpkin-lesson", "Madam Moth", "A little autumn warmth", {"resources": {"paper": 3, "ink": 2}}, {"design_id": "npc-borrowed-dawn-pumpkin"}),
            ("crashout-lesson", "The Foil Fox", "A brighter kind of trouble", {"resources": {"foil": 3, "ink": 2}}, {"design_id": "npc-foil-fox-crashout"}),
            ("starlit-map", "Astrid the Binder", "Trade for a celestial map", {"type": "land", "min_grade": 6}, {"design_id": "npc-starlit-map"}),
            ("fox-copy", "The Foil Fox", "A shining example", {"type": "monster", "min_grade": 7}, {"design_id": "npc-foil-fox"}),
            ("sunlit-note", "Madam Moth", "The rarest letter", {"resources": {"foil": 3, "ink": 1}}, {"design_id": "npc-sunlit-note"}),
            ("borrowed-dawn", "Pip the Inker", "A borrowed morning", {"resources": {"paper": 4, "ink": 3}}, {"design_id": "npc-borrowed-dawn"}),
            ("clockwork-heron", "Astrid the Binder", "A mechanical omen", {"resources": {"ink": 5, "sleeve": 1}}, {"design_id": "npc-clockwork-heron"}),
            ("tideglass-portal", "Madam Moth", "A door beneath the waves", {"resources": {"foil": 2, "ink": 3}}, {"design_id": "npc-tideglass-portal"}),
            ("press-cat-foil", "Pip the Inker", "A shining apprentice", {"resources": {"foil": 1, "ink": 2}}, {"design_id": "starter-press-cat-foil"}),
            ("starlit-map-foil", "Astrid the Binder", "A foil atlas", {"resources": {"foil": 1, "ink": 2}}, {"design_id": "npc-starlit-map-foil"}),
            ("foil-fox-standard", "The Foil Fox", "A quieter fox", {"resources": {"paper": 2, "ink": 2}}, {"design_id": "npc-foil-fox-standard"}),
        ]
        for oid, npc, title, req, reward in offers:
            db.execute("INSERT OR IGNORE INTO npc_offers VALUES(?,?,?,?,?,1)",
                       (oid, npc, title, json.dumps(req), json.dumps(reward)))


def hash_password(password):
    need(len(password) >= 10, "Password must have at least 10 characters")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + ":" + digest.hex()


def verify_password(password, encoded):
    try:
        salt, expected = encoded.split(":")
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
        return secrets.compare_digest(actual, bytes.fromhex(expected))
    except (ValueError, TypeError):
        return False


def starter_decks(db):
    decks = []
    for deck_id, deck in STARTER_DECKS.items():
        cards = []
        for design_id, copies in deck["cards"].items():
            row = db.execute("SELECT id,name,flavor,type_id,rule_ids,theme_id,finish_id,border_id,back_id,back_finish_id,art_path FROM designs WHERE id=?",
                             (design_id,)).fetchone()
            need(row is not None, "Starter deck content is unavailable", 500)
            cards.append({**dict(row), "rule_ids": json.loads(row["rule_ids"]), "copies": copies})
        decks.append({"id": deck_id, "name": deck["name"], "theme": deck["theme"],
                      "description": deck["description"], "accent": deck["accent"],
                      "featured": deck["featured"], "cards": cards})
    return decks


def create_user(db, username, password, admin=False, starter_deck_id="pressroom"):
    username = username.strip()
    need(3 <= len(username) <= 24 and username.replace("_", "").isalnum(), "Invalid username")
    need(starter_deck_id in STARTER_DECKS, "Unknown starter deck")
    try:
        cur = db.execute("INSERT INTO users(username,password_hash,is_admin,created_at,starter_deck_id) VALUES(?,?,?,?,?)",
                         (username, hash_password(password), int(admin), stamp(), starter_deck_id))
    except sqlite3.IntegrityError:
        raise GameError("Username is already taken", 409)
    user_id = cur.lastrowid
    for kind, amount in {"paper": 8, "ink": 8, "sleeve": 1, "foil": 0}.items():
        db.execute("INSERT INTO resources VALUES(?,?,?)", (user_id, kind, amount))
    for design_id, copies in STARTER_DECKS[starter_deck_id]["cards"].items():
        design = db.execute("SELECT type_id,rule_ids,theme_id,finish_id,border_id,back_id FROM designs WHERE id=?", (design_id,)).fetchone()
        need(design is not None, "Starter deck content is unavailable", 500)
        for part in {design["type_id"], design["theme_id"], design["finish_id"], design["border_id"], design["back_id"], *json.loads(design["rule_ids"])}:
            db.execute("INSERT OR IGNORE INTO learned VALUES(?,?)", (user_id, part))
        for _ in range(copies):
            mint_copy(db, design_id, user_id, quality_override=88)
    return user_id


def resource_balance(db, user_id):
    return {r["kind"]: r["amount"] for r in db.execute("SELECT kind,amount FROM resources WHERE user_id=?", (user_id,))}


def adjust_resources(db, user_id, changes):
    for kind, delta in changes.items():
        need(kind in RESOURCE_KINDS and isinstance(delta, int) and not isinstance(delta, bool), "Invalid resource")
        db.execute("INSERT OR IGNORE INTO resources VALUES(?,?,0)", (user_id, kind))
        cur = db.execute("UPDATE resources SET amount=amount+? WHERE user_id=? AND kind=? AND amount+?>=0",
                         (delta, user_id, kind, delta))
        need(cur.rowcount == 1, f"Not enough {kind}")


def audit(db, actor_id, action, target, reason, detail=None):
    db.execute("INSERT INTO audit(actor_id,action,target,reason,detail,created_at) VALUES(?,?,?,?,?,?)",
               (actor_id, action, target, reason, json.dumps(detail or {}), stamp()))


def catalogue(db, user_id):
    rows = db.execute("SELECT p.*, CASE WHEN l.user_id IS NULL THEN 0 ELSE 1 END learned FROM parts p "
                      "LEFT JOIN learned l ON l.part_id=p.id AND l.user_id=? WHERE active=1 ORDER BY kind,name", (user_id,))
    return [obj(r) for r in rows]


def collection_progress(db, user_id):
    def progress(collected, total):
        return {"collected": collected, "total": total,
                "percent": round(100 * collected / total) if total else 0}

    result = {}
    for label, kind in (("rules", "rule"), ("foils", "finish"),
                        ("borders", "border"), ("backs", "back")):
        total = db.execute("SELECT COUNT(*) FROM parts WHERE kind=? AND active=1", (kind,)).fetchone()[0]
        collected = db.execute("SELECT COUNT(*) FROM learned l JOIN parts p ON p.id=l.part_id "
                               "WHERE l.user_id=? AND p.kind=? AND p.active=1", (user_id, kind)).fetchone()[0]
        result[label] = progress(collected, total)
    total = db.execute("SELECT COUNT(*) FROM designs").fetchone()[0]
    collected = db.execute("SELECT COUNT(DISTINCT design_id) FROM copies WHERE owner_id=?", (user_id,)).fetchone()[0]
    result["cards"] = progress(collected, total)
    return result


def print_cost(db, rule_ids, finish_id, border_id="classic", back_id="archive", back_finish_id=None):
    cost = {"paper": 1, "ink": max(1, len(rule_ids) - 1) + (0 if finish_id == "standard" else 2), "foil": 0}
    front_foil = 0
    for part_id, part_kind in ((finish_id, "finish"), (border_id, "border"), (back_id, "back")):
        row = db.execute("SELECT cost_json FROM parts WHERE id=? AND kind=?", (part_id, part_kind)).fetchone()
        need(row is not None, f"Unknown {part_kind}")
        for kind, amount in json.loads(row[0]).items():
            need(kind in RESOURCE_KINDS and type(amount) is int and amount >= 0, "Invalid print recipe")
            cost[kind] = cost.get(kind, 0) + amount
            if part_kind == "finish" and kind == "foil":
                front_foil = amount
    if back_finish_id and back_id != "mischief":
        need(back_finish_id == finish_id and finish_id != "standard", "Invalid back finish")
        cost["ink"] += 1
        cost["foil"] += front_foil
    return cost


def validate_recipe(db, user_id, payload):
    type_id = payload.get("type_id")
    rules = payload.get("rule_ids", [])
    theme = payload.get("theme_id")
    finish = payload.get("finish_id", "standard")
    border = payload.get("border_id", "classic")
    back = payload.get("back_id", "archive")
    foil_back = payload.get("foil_back", False)
    hint = payload.get("hint", "")
    need(isinstance(hint, str) and len(hint) <= 254, "Hint must be 254 characters or fewer")
    need(type(foil_back) is bool, "Invalid back foil choice")
    need(not foil_back or (back != "mischief" and finish != "standard"), "Back foil requires a nonstandard front finish and a non-Fox back")
    hint = " ".join(hint.split())
    need(isinstance(rules, list) and 1 <= len(rules) <= 3 and len(set(rules)) == len(rules), "Choose one to three distinct rules")
    selected = [(type_id, "type"), (theme, "theme"), (finish, "finish"),
                (border, "border"), (back, "back")] + [(r, "rule") for r in rules]
    for part_id, kind in selected:
        row = db.execute("SELECT kind,active FROM parts WHERE id=?", (part_id,)).fetchone()
        need(row and row["kind"] == kind and row["active"], f"Invalid {kind}")
        need(db.execute("SELECT 1 FROM learned WHERE user_id=? AND part_id=?", (user_id, part_id)).fetchone(),
             f"You have not learned {part_id}")
    need(sum(db.execute("SELECT power FROM parts WHERE id=?", (r,)).fetchone()[0] for r in rules) <= 5,
         "The card exceeds its power limit")
    slots = [db.execute("SELECT slot FROM parts WHERE id=?", (r,)).fetchone()[0] for r in rules]
    need(slots.count("trigger") == 1 and slots.count("effect") == 1 and slots.count("condition") <= 1,
         "Choose one trigger, one effect, and at most one condition")
    return {"type_id": type_id, "rule_ids": rules, "theme_id": theme, "finish_id": finish,
            "border_id": border, "back_id": back,
            "back_finish_id": "shimmer" if back == "mischief" else finish if foil_back else None, "hint": hint}


def generation_count(db, user_id):
    today = day()
    reset = db.execute("SELECT reset_at FROM generation_resets WHERE user_id=? AND day=?", (user_id, today)).fetchone()
    since = reset[0] if reset else today
    return db.execute("SELECT COUNT(*) FROM jobs WHERE user_id=? AND kind='design' AND substr(created_at,1,10)=? "
                      "AND status!='failed' AND created_at>?", (user_id, today, since)).fetchone()[0]


def create_print_job(db, user_id, payload, request_key):
    need(8 <= len(request_key) <= 128, "An idempotency key is required")
    existing = db.execute("SELECT * FROM jobs WHERE id=? AND user_id=?", (request_key, user_id)).fetchone()
    if existing:
        return obj(existing)
    recipe = validate_recipe(db, user_id, payload)
    limit = int(os.getenv("NEW_DESIGNS_PER_DAY", "5"))
    need(generation_count(db, user_id) < limit, "Daily design limit reached")
    cost = print_cost(db, recipe["rule_ids"], recipe["finish_id"], recipe["border_id"], recipe["back_id"], recipe["back_finish_id"])
    adjust_resources(db, user_id, {k: -v for k, v in cost.items()})
    db.execute("INSERT INTO jobs(id,user_id,kind,payload,status,created_at) VALUES(?,?,?,?,?,?)",
               (request_key, user_id, "design", json.dumps({"recipe": recipe, "cost": cost}), "pending", stamp()))
    return obj(db.execute("SELECT * FROM jobs WHERE id=?", (request_key,)).fetchone())


def _bell_offset(scale, limit):
    # Six uniform draws form a symmetric, bell-shaped offset around zero.
    value = (sum(secrets.randbelow(1001) for _ in range(6)) / 1000 - 3) * scale
    return round(max(-limit, min(limit, value)), 2)


def quality_attributes(recipe, quality_override=None):
    if quality_override is not None:
        score = max(0, min(100, int(quality_override)))
        return score, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, "none", 0.0, 0.0
    centering_x, centering_y = (_bell_offset(.20, .45), _bell_offset(.20, .45)) if secrets.randbelow(100) < 18 else (0.0, 0.0)
    shifts = [0.0] * 4
    if secrets.randbelow(100) < 16:
        first = secrets.randbelow(4)
        shifts[first] = _bell_offset(.12, .28)
        if secrets.randbelow(100) < 20:
            shifts[(first + 1 + secrets.randbelow(3)) % 4] = _bell_offset(.12, .28)
    effect = secrets.choice(["fade", "desaturated", "hue-shift"]) if secrets.randbelow(100) < 5 else "none"
    surface = abs(_bell_offset(.14, .3)) if secrets.randbelow(100) < 12 else 0.0
    edge = abs(_bell_offset(.10, .22)) if secrets.randbelow(100) < 8 else 0.0
    complexity = max(0, len(recipe.get("rule_ids", [])) - 2) * 3
    score = max(1, min(100, round(100 - complexity - 5*abs(centering_x) - 5*abs(centering_y)
                                  - 3*sum(abs(v) for v in shifts) - 4*(effect != "none")
                                  - 9*surface - 7*edge)))
    return score, centering_x, centering_y, *shifts, effect, surface, edge


def mint_copy(db, design_id, owner_id, origin_id=None, quality_override=None):
    design = db.execute("SELECT * FROM designs WHERE id=?", (design_id,)).fetchone()
    need(design is not None, "Design not found", 404)
    recipe = obj(design)
    recipe["rule_ids"] = json.loads(recipe["rule_ids"])
    score, centering_x, centering_y, shift_c, shift_m, shift_y, shift_k, effect, surface, edge = quality_attributes(recipe, quality_override)
    copy_id = uid()
    db.execute("INSERT INTO copies(id,design_id,owner_id,origin_id,created_at,print_score,centering_x,centering_y,"
               "shift_c,shift_m,shift_y,shift_k,color_effect,surface,edge,aged_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
               (copy_id, design_id, owner_id, origin_id, stamp(), score, centering_x, centering_y,
                shift_c, shift_m, shift_y, shift_k, effect, surface, edge, day()))
    return copy_id


def reprint(db, user_id, copy_id):
    source = db.execute("SELECT c.*, d.finish_id, d.type_id, d.rule_ids, d.theme_id, d.border_id, d.back_id, d.back_finish_id FROM copies c "
                        "JOIN designs d ON d.id=c.design_id WHERE c.id=? AND c.owner_id=?", (copy_id, user_id)).fetchone()
    need(source is not None, "Copy not found", 404)
    source = age_copy(db, source)
    need(source["condition"] > 0, "This copy is too worn to reprint")
    need(source["slab_grade"] is None, "Break the slab before reprinting")
    parts = [source["type_id"], source["theme_id"], source["finish_id"],
             source["border_id"], source["back_id"]] + json.loads(source["rule_ids"])
    for part in parts:
        need(db.execute("SELECT 1 FROM learned WHERE user_id=? AND part_id=?", (user_id, part)).fetchone(),
             "Study this design before reprinting")
    cost = print_cost(db, json.loads(source["rule_ids"]), source["finish_id"], source["border_id"], source["back_id"], source["back_finish_id"])
    adjust_resources(db, user_id, {k: -v for k, v in cost.items()})
    new_copy = mint_copy(db, source["design_id"], user_id, copy_id)
    wear(db, copy_id, 1)
    return new_copy


def charge_physical_print(db, user_id, items, request_key):
    need(8 <= len(request_key) <= 128, "An idempotency key is required")
    need(isinstance(items, list) and items, "Choose at least one card")
    quantities = {}
    for item in items:
        need(isinstance(item, dict) and isinstance(item.get("copy_id"), str) and
             isinstance(item.get("quantity"), int) and not isinstance(item["quantity"], bool) and
             1 <= item["quantity"] <= 90, "Invalid print quantity")
        quantities[item["copy_id"]] = quantities.get(item["copy_id"], 0) + item["quantity"]
    count = sum(quantities.values())
    need(count <= 90, "Choose at most 90 cards per export")
    signature = json.dumps(sorted(quantities.items()), separators=(",", ":"))
    existing = db.execute("SELECT payload FROM jobs WHERE id=? AND user_id=? AND kind='physical-export'", (request_key, user_id)).fetchone()
    if existing:
        result = json.loads(existing["payload"])
        need(result["signature"] == signature, "Print request key was used for different cards")
        return {"cards": result["cards"], "sheets": result["sheets"]}
    sheets = math.ceil(count / 9)
    rows = {}
    for copy_id, quantity in quantities.items():
        row = db.execute("SELECT * FROM copies WHERE id=? AND owner_id=?", (copy_id, user_id)).fetchone()
        need(row is not None, "Copy not found", 404)
        row = age_copy(db, row)
        need(row["sleeved"] or row["slab_grade"] is not None or row["condition"] >= quantity,
             "A selected copy does not have enough condition")
        rows[copy_id] = row
    adjust_resources(db, user_id, {"paper": -sheets})
    for copy_id, quantity in quantities.items():
        row = rows[copy_id]
        if not row["sleeved"] and row["slab_grade"] is None:
            db.execute("UPDATE copies SET condition=condition-? WHERE id=?", (quantity, copy_id))
    db.execute("INSERT INTO jobs(id,user_id,kind,payload,status,created_at) VALUES(?,?,?,?,?,?)",
               (request_key, user_id, "physical-export", json.dumps({"signature": signature, "cards": count, "sheets": sheets}), "complete", stamp()))
    return {"cards": count, "sheets": sheets}


def age_copy(db, row):
    row = obj(row)
    elapsed = max(0, (now().date() - datetime.fromisoformat(row["aged_at"]).date()).days)
    if elapsed:
        condition = row["condition"] if row["sleeved"] or row["slab_grade"] is not None else max(0, row["condition"] - min(elapsed, 30))
        db.execute("UPDATE copies SET condition=?,aged_at=? WHERE id=?", (condition, day(), row["id"]))
        row["condition"], row["aged_at"] = condition, day()
    return row


def grade(row):
    return max(1, min(10, math.ceil(min(row["print_score"], row["condition"]) / 10)))


def grade_name(n):
    return {1: "Poor", 2: "Fair", 3: "Very Good", 4: "Very Good+", 5: "Excellent", 6: "Excellent+",
            7: "Near Mint", 8: "Near Mint-Mint", 9: "Mint", 10: "Gem Mint"}[n]


def copy_detail(db, copy_id, user_id=None, age=True):
    row = db.execute("SELECT c.*,d.creator_id,d.type_id,d.rule_ids,d.theme_id,d.finish_id,d.border_id,d.back_id,d.back_finish_id,d.name,d.flavor,d.art_path,"
                     "u.username creator FROM copies c JOIN designs d ON d.id=c.design_id "
                     "LEFT JOIN users u ON u.id=d.creator_id WHERE c.id=?", (copy_id,)).fetchone()
    need(row is not None, "Copy not found", 404)
    data = age_copy(db, row) if age else obj(row)
    data["rule_ids"] = json.loads(data["rule_ids"])
    rule_parts = [db.execute("SELECT name,description FROM parts WHERE id=?", (rid,)).fetchone()
                  for rid in data["rule_ids"]]
    data["rule_names"] = [part["name"] for part in rule_parts if part]
    data["rule_text"] = [part["description"] for part in rule_parts if part]
    data["grade"] = grade(data)
    data["grade_name"] = grade_name(data["grade"])
    data["estimated_grade"] = "Mint" if data["grade"] >= 9 else "Near Mint" if data["grade"] >= 7 else "Played" if data["grade"] >= 4 else "Poor"
    data["exact_grade_visible"] = data["slab_grade"] is not None or data["owner_id"] == user_id
    return data


def library(db, user_id):
    ids = [r[0] for r in db.execute("SELECT id FROM copies WHERE owner_id=? ORDER BY created_at DESC", (user_id,))]
    return [copy_detail(db, cid, user_id) for cid in ids]


def wear(db, copy_id, points):
    row = db.execute("SELECT * FROM copies WHERE id=?", (copy_id,)).fetchone()
    need(row is not None, "Copy not found", 404)
    row = age_copy(db, row)
    if not row["sleeved"] and row["slab_grade"] is None:
        db.execute("UPDATE copies SET condition=max(0,condition-?) WHERE id=?", (points, copy_id))


def study(db, user_id, copy_id):
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id, "Copy not owned", 403)
    need(card["slab_grade"] is None, "Break the slab before studying")
    need(card["condition"] > 0, "This copy is too worn to study")
    parts = [card["type_id"], card["theme_id"], card["finish_id"],
             card["border_id"], card["back_id"]] + card["rule_ids"]
    new = list(dict.fromkeys(part for part in parts if not db.execute(
        "SELECT 1 FROM learned WHERE user_id=? AND part_id=?", (user_id, part)).fetchone()))
    need(new, "You have already learned everything on this card")
    for part in new:
        db.execute("INSERT INTO learned VALUES(?,?)", (user_id, part))
    db.execute("UPDATE copies SET condition=max(0,condition-?) WHERE id=?",
               (math.ceil(card["condition"] / 10), copy_id))
    return new


def sleeve(db, user_id, copy_id):
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id and not card["listed"], "Copy unavailable")
    need(not card["sleeved"] and card["slab_grade"] is None, "Copy already protected")
    adjust_resources(db, user_id, {"sleeve": -1})
    db.execute("UPDATE copies SET sleeved=1 WHERE id=?", (copy_id,))


def certify(db, user_id, copy_id):
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id and not card["listed"], "Copy unavailable")
    need(card["slab_grade"] is None, "Already certified")
    adjust_resources(db, user_id, {"ink": -1, "sleeve": 0 if card["sleeved"] else -1})
    n = card["grade"]
    db.execute("UPDATE copies SET slab_grade=?,sleeved=0 WHERE id=?", (n, copy_id))
    return n


def crack(db, user_id, copy_id):
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id and not card["listed"], "Copy unavailable")
    need(card["slab_grade"] is not None, "Copy is not slabbed")
    db.execute("UPDATE copies SET slab_grade=NULL WHERE id=?", (copy_id,))


def award_activity(db, user_id, activity, claim_key, rewards):
    try:
        db.execute("INSERT INTO activity_claims VALUES(?,?,?,?)", (user_id, activity, claim_key, stamp()))
    except sqlite3.IntegrityError:
        raise GameError("Reward already claimed", 409)
    adjust_resources(db, user_id, rewards)


def daily_allowance_claimed(db, user_id):
    return bool(db.execute("SELECT 1 FROM activity_claims WHERE user_id=? AND activity='allowance' AND claim_key=?",
                           (user_id, day())).fetchone())


def claim_daily_allowance(db, user_id):
    award_activity(db, user_id, "allowance", day(), {"paper": 10, "ink": 10})
    return {"paper": 10, "ink": 10}


ROTATING_NPC_CARDS = ("starlit-map", "fox-copy", "sunlit-note")


def npc_offer_available(offer_id, user_id):
    if offer_id not in ROTATING_NPC_CARDS:
        return True
    selected = int(hashlib.sha256(f"{day()}:{user_id}".encode()).hexdigest(), 16) % len(ROTATING_NPC_CARDS)
    return offer_id == ROTATING_NPC_CARDS[selected]


def qualifies(card, requirement):
    if "type" in requirement and card["type_id"] != requirement["type"]:
        return False
    if card["grade"] < requirement.get("min_grade", 1):
        return False
    if requirement.get("sleeved") and not card["sleeved"]:
        return False
    if requirement.get("slabbed") and card["slab_grade"] is None:
        return False
    return True


def commission_claim(db, user_id, commission_id, copy_id):
    brief = db.execute("SELECT * FROM commissions WHERE id=? AND active=1", (commission_id,)).fetchone()
    need(brief is not None, "Commission unavailable", 404)
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id and not card["listed"], "Copy unavailable")
    need(qualifies(card, json.loads(brief["requirement"])), "Copy does not meet the brief")
    prior = db.execute("SELECT count FROM commission_claims WHERE user_id=? AND commission_id=? AND day=?",
                       (user_id, commission_id, day())).fetchone()
    count = prior[0] if prior else 0
    need(count < (3 if brief["repeatable"] else 1), "Commission completed today")
    db.execute("INSERT INTO commission_claims VALUES(?,?,?,1) ON CONFLICT(user_id,commission_id,day) "
               "DO UPDATE SET count=count+1", (user_id, commission_id, day()))
    db.execute("UPDATE copies SET owner_id=NULL WHERE id=?", (copy_id,))
    reward = json.loads(brief["reward"])
    award_activity(db, user_id, "commission", f"{commission_id}:{day()}:{count+1}", reward)
    return reward


def npc_trade(db, user_id, offer_id, copy_id=None):
    offer = db.execute("SELECT * FROM npc_offers WHERE id=? AND active=1", (offer_id,)).fetchone()
    need(offer is not None, "NPC offer unavailable", 404)
    need(npc_offer_available(offer_id, user_id), "This offer is not available today")
    need(not db.execute("SELECT 1 FROM npc_claims WHERE user_id=? AND offer_id=? AND day=?", (user_id, offer_id, day())).fetchone(),
         "Already traded with this NPC today")
    req, reward = json.loads(offer["requirement"]), json.loads(offer["reward"])
    if "resources" in req:
        adjust_resources(db, user_id, {k: -v for k, v in req["resources"].items()})
    else:
        need(copy_id is not None, "Select a card to trade")
        card = copy_detail(db, copy_id, user_id)
        need(card["owner_id"] == user_id and not card["listed"] and qualifies(card, req), "Card does not meet the offer")
        db.execute("UPDATE copies SET owner_id=NULL WHERE id=?", (copy_id,))
    db.execute("INSERT INTO npc_claims VALUES(?,?,?)", (user_id, offer_id, day()))
    if "resources" in reward:
        award_activity(db, user_id, "npc", f"{offer_id}:{day()}", reward["resources"])
    if "learn" in reward:
        db.execute("INSERT OR IGNORE INTO learned VALUES(?,?)", (user_id, reward["learn"]))
    if "design_id" in reward:
        reward = {**reward, "copy_id": mint_copy(db, reward["design_id"], user_id)}
    return reward


def make_listing(db, user_id, copy_id, wish):
    card = copy_detail(db, copy_id, user_id)
    need(card["owner_id"] == user_id and not card["listed"], "Copy unavailable")
    need(1 <= len(wish.strip()) <= 160, "Describe what you want")
    listing_id = uid()
    db.execute("INSERT INTO listings VALUES(?,?,?,?,?,?)", (listing_id, user_id, copy_id, wish.strip(), "open", stamp()))
    db.execute("UPDATE copies SET listed=1 WHERE id=?", (copy_id,))
    return listing_id


def make_offer(db, user_id, listing_id, copy_ids):
    listing = db.execute("SELECT * FROM listings WHERE id=? AND status='open'", (listing_id,)).fetchone()
    need(listing is not None, "Listing unavailable", 404)
    need(listing["seller_id"] != user_id, "Cannot offer on your own listing")
    need(isinstance(copy_ids, list) and 1 <= len(copy_ids) <= 3 and len(set(copy_ids)) == len(copy_ids), "Offer one to three copies")
    for cid in copy_ids:
        card = copy_detail(db, cid, user_id)
        need(card["owner_id"] == user_id and not card["listed"], "Offered copy unavailable")
    offer_id = uid()
    db.execute("INSERT INTO offers VALUES(?,?,?,?,?,?)", (offer_id, listing_id, user_id, json.dumps(copy_ids), "open", stamp()))
    return offer_id


def accept_offer(db, user_id, offer_id):
    offer = db.execute("SELECT o.*,l.seller_id,l.copy_id,l.status listing_status FROM offers o "
                       "JOIN listings l ON l.id=o.listing_id WHERE o.id=?", (offer_id,)).fetchone()
    need(offer is not None and offer["seller_id"] == user_id, "Offer unavailable", 404)
    need(offer["status"] == "open" and offer["listing_status"] == "open", "Offer is closed")
    listed = copy_detail(db, offer["copy_id"], user_id)
    need(listed["owner_id"] == user_id, "Listed copy unavailable")
    copy_ids = json.loads(offer["copy_ids"])
    for cid in copy_ids:
        card = copy_detail(db, cid, offer["buyer_id"])
        need(card["owner_id"] == offer["buyer_id"] and not card["listed"], "Offered copy unavailable")
    db.execute("UPDATE copies SET owner_id=?,listed=0 WHERE id=?", (offer["buyer_id"], offer["copy_id"]))
    wear(db, offer["copy_id"], 2)
    for cid in copy_ids:
        db.execute("UPDATE copies SET owner_id=? WHERE id=?", (user_id, cid))
        wear(db, cid, 2)
    db.execute("UPDATE listings SET status='closed' WHERE id=?", (offer["listing_id"],))
    db.execute("UPDATE offers SET status=CASE WHEN id=? THEN 'accepted' ELSE 'declined' END WHERE listing_id=?",
               (offer_id, offer["listing_id"]))
    return {"received": copy_ids, "sent": offer["copy_id"]}


def admin_action(db, actor_id, action, payload, reason):
    actor = db.execute("SELECT is_admin FROM users WHERE id=?", (actor_id,)).fetchone()
    need(actor is not None and actor["is_admin"], "Admin required", 403)
    need(reason and reason.strip(), "An audit reason is required")
    target = str(payload.get("user_id") or payload.get("username") or payload.get("copy_id") or payload.get("design_id") or action)
    if action == "create-player":
        result = {"user_id": create_user(db, payload["username"], payload["password"], bool(payload.get("is_admin")),
                                          payload.get("starter_deck_id", "pressroom"))}
    elif action == "grant-resource":
        adjust_resources(db, int(payload["user_id"]), {payload["kind"]: int(payload["amount"])})
        result = {"balance": resource_balance(db, int(payload["user_id"]))}
    elif action == "grant-part":
        db.execute("INSERT OR IGNORE INTO learned VALUES(?,?)", (int(payload["user_id"]), payload["part_id"]))
        result = {"part_id": payload["part_id"]}
    elif action == "create-design":
        from .providers import demo_art
        design_id = uid()
        rules = payload.get("rule_ids", ["arrival", "draw"])
        art = demo_art(design_id, payload.get("theme_id", "storybook"), payload["name"])
        db.execute("INSERT INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id,back_finish_id) "
                   "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (design_id, actor_id, payload.get("type_id", "monster"),
                   json.dumps(rules), payload.get("theme_id", "storybook"), payload.get("finish_id", "standard"),
                   payload["name"], payload.get("flavor", "A curious edition from the archives."), art, stamp(),
                   payload.get("border_id", "classic"), payload.get("back_id", "archive"),
                   "shimmer" if payload.get("back_id") == "mischief" else None))
        result = {"design_id": design_id}
    elif action == "print-copy":
        copy_id = mint_copy(db, payload["design_id"], int(payload["user_id"]), quality_override=payload.get("quality"))
        defect_fields = {"centering_x", "centering_y", "shift_c", "shift_m", "shift_y", "shift_k", "surface", "edge"}
        for field in defect_fields & payload.keys():
            value = float(payload[field])
            need(-1 <= value <= 1 if field not in {"surface", "edge"} else 0 <= value <= 1, "Defect value out of range")
            db.execute(f"UPDATE copies SET {field}=? WHERE id=?", (value, copy_id))
        if "color_effect" in payload:
            need(payload["color_effect"] in {"none", "fade", "desaturated", "hue-shift"}, "Invalid color effect")
            db.execute("UPDATE copies SET color_effect=? WHERE id=?", (payload["color_effect"], copy_id))
        result = {"copy_id": copy_id}
    elif action == "give-copy":
        card = copy_detail(db, payload["copy_id"])
        need(not card["listed"], "Listed copy unavailable")
        db.execute("UPDATE copies SET owner_id=? WHERE id=?", (int(payload["user_id"]), payload["copy_id"]))
        result = {"copy_id": payload["copy_id"]}
    elif action == "set-grade":
        card = copy_detail(db, payload["copy_id"])
        score = int(payload["quality"])
        need(0 <= score <= 100, "Quality must be 0–100")
        db.execute("UPDATE copies SET print_score=?,slab_grade=NULL WHERE id=?", (score, payload["copy_id"]))
        result = {"copy_id": payload["copy_id"], "quality": score}
    elif action == "update-design":
        design_id = payload["design_id"]
        need(db.execute("SELECT 1 FROM designs WHERE id=?", (design_id,)).fetchone(), "Design not found", 404)
        need(not db.execute("SELECT 1 FROM copies WHERE design_id=?", (design_id,)).fetchone(),
             "Printed designs are immutable")
        from .providers import demo_art
        name = str(payload["name"]).strip()[:48]
        flavor = str(payload.get("flavor", "")).strip()[:140]
        need(name and flavor, "Name and flavor are required")
        art = demo_art(design_id, payload.get("theme_id", "storybook"), name)
        db.execute("UPDATE designs SET name=?,flavor=?,type_id=?,rule_ids=?,theme_id=?,finish_id=?,border_id=?,back_id=?,back_finish_id=?,art_path=? WHERE id=?",
                   (name, flavor, payload.get("type_id", "monster"), json.dumps(payload.get("rule_ids", ["arrival", "draw"])),
                    payload.get("theme_id", "storybook"), payload.get("finish_id", "standard"),
                    payload.get("border_id", "classic"), payload.get("back_id", "archive"),
                    "shimmer" if payload.get("back_id") == "mischief" else None, art, design_id))
        result = {"design_id": design_id}
    elif action == "set-part":
        part_id = payload["id"]
        kind = payload["kind"]
        need(kind in {"type", "rule", "theme", "finish", "border", "back"}, "Invalid part kind")
        slot = payload.get("slot", "")
        need(kind != "rule" or slot in {"trigger", "condition", "effect"}, "Rule slot must be trigger, condition, or effect")
        finish_cost = payload.get("cost", {}) if kind in {"finish", "border", "back"} else {}
        need(isinstance(finish_cost, dict) and all(k in RESOURCE_KINDS and isinstance(v, int) and v >= 0 for k, v in finish_cost.items()),
             "Invalid part cost")
        db.execute("INSERT INTO parts(id,kind,name,description,power,active,slot,cost_json) VALUES(?,?,?,?,?,?,?,?) "
                   "ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,description=excluded.description,"
                   "power=excluded.power,active=excluded.active,slot=excluded.slot,cost_json=excluded.cost_json",
                   (part_id, kind, payload["name"], payload.get("description", ""), int(payload.get("power", 0)), int(payload.get("active", 1)), slot, json.dumps(finish_cost)))
        result = {"part_id": part_id}
    elif action == "set-commission":
        cid = payload["id"]
        db.execute("INSERT INTO commissions(id,title,description,requirement,reward,repeatable,daily,active) VALUES(?,?,?,?,?,?,?,?) "
                   "ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,"
                   "requirement=excluded.requirement,reward=excluded.reward,repeatable=excluded.repeatable,daily=excluded.daily,active=excluded.active",
                   (cid, payload["title"], payload.get("description", ""), json.dumps(payload["requirement"]),
                    json.dumps(payload["reward"]), int(payload.get("repeatable", 0)), int(payload.get("daily", 1)), int(payload.get("active", 1))))
        result = {"commission_id": cid}
    elif action == "set-npc-offer":
        oid = payload["id"]
        db.execute("INSERT INTO npc_offers(id,npc_name,title,requirement,reward,active) VALUES(?,?,?,?,?,?) "
                   "ON CONFLICT(id) DO UPDATE SET npc_name=excluded.npc_name,title=excluded.title,"
                   "requirement=excluded.requirement,reward=excluded.reward,active=excluded.active",
                   (oid, payload["npc_name"], payload["title"], json.dumps(payload["requirement"]),
                    json.dumps(payload["reward"]), int(payload.get("active", 1))))
        result = {"offer_id": oid}
    else:
        raise GameError("Unknown admin action")
    safe_payload = {**payload}
    safe_payload.pop("password", None)
    audit(db, actor_id, action, target, reason, safe_payload)
    return result
