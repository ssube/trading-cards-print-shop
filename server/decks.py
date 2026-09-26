"""Curated and player-created three-card deck goals."""

from . import game

CURATED = [
    {"id": "pressroom", "title": "The Pressroom Parade", "theme": "storybook", "description": "A first shift at the press, with ink on every paw.", "accent": "amber", "designs": ["starter-press-cat", "starter-press-cat-foil", "starter-paper-sprite"], "reward": {"design_id": "reward-press-cat-holo", "resources": {"sleeve": 1}}},
    {"id": "starlit", "title": "The Starlit Atlas", "theme": "celestial", "description": "Three impressions to chart a sky that will not sit still.", "accent": "blue", "designs": ["npc-starlit-map", "npc-starlit-map-foil", "starter-paper-sprite"], "reward": {"design_id": "reward-starlit-map-holo", "resources": {"foil": 1}}},
    {"id": "velvet", "title": "The Velvet Mischief", "theme": "absurd", "description": "A fox, a gleam, and one perfectly innocent alibi.", "accent": "rose", "designs": ["npc-foil-fox", "npc-foil-fox-standard", "starter-paper-sprite"], "reward": {"design_id": "reward-foil-fox-holo", "slab_grade": 8, "resources": {"foil": 1}}},
    {"id": "garden", "title": "The Borrowed Morning", "theme": "botanical", "description": "Gather a dawn, a spark of ink, and a helpful apprentice.", "accent": "green", "designs": ["npc-borrowed-dawn", "starter-paper-sprite", "starter-press-cat"], "reward": {"design_id": "reward-borrowed-dawn-holo", "resources": {"sleeve": 2}}},
    {"id": "clockwork", "title": "The Clockwork Almanac", "theme": "clockwork", "description": "A heron keeps the hours while the heavens lose count.", "accent": "blue", "designs": ["npc-clockwork-heron", "npc-starlit-map", "npc-sunlit-note"], "reward": {"design_id": "reward-clockwork-heron-holo", "slab_grade": 8, "resources": {}}},
    {"id": "tideglass", "title": "The Tideglass Expedition", "theme": "maritime", "description": "Find a door, draw a map, and let the fox navigate.", "accent": "teal", "designs": ["npc-tideglass-portal", "npc-starlit-map", "npc-foil-fox"], "reward": {"resources": {"foil": 3, "sleeve": 2}}},
    {"id": "papermill", "title": "The Feline Papermill", "theme": "storybook", "description": "Three shifts, six cats, and absolutely no accounting questions.", "accent": "amber", "designs": ["mill-apprentice", "mill-roller", "mill-master"], "reward": {"design_id": "reward-mill-master-holo", "resources": {"sleeve": 1}}},
    {"id": "fish", "title": "The Curious Catch", "theme": "maritime", "description": "Three rare fish from the pond behind the press.", "accent": "teal", "designs": ["fish-lanternfin", "fish-inkscale", "fish-moonkoi"], "reward": {"design_id": "reward-moonkoi-holo", "resources": {"foil": 1}}},
    {"id": "demon", "title": "The Infernal Press", "theme": "infernal", "description": "Three bosses escaped the furnace. File them under occupational hazards.", "accent": "rose", "designs": ["demon-cinderlord", "demon-ashwarden", "demon-pressfiend"], "reward": {"design_id": "reward-pressfiend-holo", "resources": {"foil": 1, "sleeve": 1}}},
    {"id": "tabletop", "title": "The Tabletop Trials", "theme": "absurd", "description": "Learn the table before somebody invents a house rule.", "accent": "blue", "designs": ["tabletop-opening-hand", "tabletop-counter-keeper", "tabletop-playmaker"], "reward": {"design_id": "reward-playmaker-holo", "resources": {"sleeve": 1}}},
]
REWARD_VARIANTS = {
    "reward-press-cat-holo": "starter-press-cat",
    "reward-starlit-map-holo": "npc-starlit-map",
    "reward-foil-fox-holo": "npc-foil-fox",
    "reward-borrowed-dawn-holo": "npc-borrowed-dawn",
    "reward-clockwork-heron-holo": "npc-clockwork-heron",
    "reward-mill-master-holo": "mill-master",
    "reward-moonkoi-holo": "fish-moonkoi",
    "reward-pressfiend-holo": "demon-pressfiend",
    "reward-playmaker-holo": "tabletop-playmaker",
}


def seed_rewards(db):
    for reward_id, source_id in REWARD_VARIANTS.items():
        db.execute("INSERT OR IGNORE INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id,back_finish_id) "
                   "SELECT ?,NULL,type_id,rule_ids,theme_id,'holo',name,flavor,art_path,?,border_id,back_id,back_finish_id FROM designs WHERE id=?",
                   (reward_id, game.stamp(), source_id))


def validate_custom(db, title, theme):
    game.need(isinstance(title, str) and 1 <= len(title.strip()) <= 64, "Deck title must be 1–64 characters")
    game.need(isinstance(theme, str) and db.execute("SELECT 1 FROM parts WHERE id=? AND kind='theme' AND active=1", (theme,)).fetchone(), "Choose an available theme")
    return title.strip(), theme


def create_custom(db, user_id, title, theme):
    title, theme = validate_custom(db, title, theme)
    game.need(db.execute("SELECT COUNT(*) FROM custom_decks WHERE user_id=?", (user_id,)).fetchone()[0] < 20,
              "You can keep at most 20 custom decks")
    deck_id = game.uid()
    db.execute("INSERT INTO custom_decks(id,user_id,title,theme_id,created_at) VALUES(?,?,?,?,?)",
               (deck_id, user_id, title, theme, game.stamp()))
    return deck_id


def update_custom(db, user_id, deck_id, title, theme):
    title, theme = validate_custom(db, title, theme)
    cur = db.execute("UPDATE custom_decks SET title=?,theme_id=? WHERE id=? AND user_id=?", (title, theme, deck_id, user_id))
    game.need(cur.rowcount == 1, "Deck not found", 404)


def delete_custom(db, user_id, deck_id):
    cur = db.execute("DELETE FROM custom_decks WHERE id=? AND user_id=?", (deck_id, user_id))
    game.need(cur.rowcount == 1, "Deck not found", 404)


def _matches(library, definition):
    slots = []
    used = set()
    designs = definition.get("designs")
    for index in range(3):
        design_id = designs[index] if designs else None
        type_id = None if designs else ("land", "monster", "spell")[index]
        matching = [card for card in library if card["id"] not in used and
                    (card["design_id"] == design_id if design_id else card["theme_id"] == definition["theme"] and card["type_id"] == type_id)]
        matching.sort(key=lambda card: (-card["grade"], -card["print_score"], card["id"]))
        card = matching[0] if matching else None
        if card:
            used.add(card["id"])
        slots.append({"key": str(index), "design_id": design_id, "type_id": type_id,
                      "label": definition["labels"][index] if designs else type_id.title(), "card": card})
    return slots


def _analysis(slots, power):
    cards = [slot["card"] for slot in slots if slot["card"]]
    types, finishes, rules = {}, {}, {}
    for card in cards:
        types[card["type_id"]] = types.get(card["type_id"], 0) + 1
        finishes[card["finish_id"]] = finishes.get(card["finish_id"], 0) + 1
        for rule in card["rule_ids"]:
            rules[rule] = rules.get(rule, 0) + 1
    return {"type_counts": types, "finish_counts": finishes, "rule_counts": rules,
            "total_power": sum(power.get(rule, 0) for card in cards for rule in card["rule_ids"]),
            "average_grade": round(sum(card["grade"] for card in cards) / len(cards), 1) if cards else 0,
            "protected": sum(bool(card["sleeved"] or card["slab_grade"] is not None) for card in cards)}


def list_decks(db, user_id):
    library = game.library(db, user_id)
    power = {row["id"]: row["power"] for row in db.execute("SELECT id,power FROM parts WHERE kind='rule'")}
    design_names = {row["id"]: row["name"] for row in db.execute("SELECT id,name FROM designs")}
    definitions = [{**deck, "kind": "curated", "labels": [design_names.get(did, did) for did in deck["designs"]]}
                   for deck in CURATED]
    definitions += [{"id": row["id"], "title": row["title"], "theme": row["theme_id"],
                     "description": "A collection challenge made by you.", "accent": "amber", "kind": "custom"}
                    for row in db.execute("SELECT * FROM custom_decks WHERE user_id=? ORDER BY created_at,id", (user_id,))]
    claimed = {row[0] for row in db.execute("SELECT deck_id FROM deck_claims WHERE user_id=?", (user_id,))}
    result = []
    for deck in definitions:
        slots = _matches(library, deck)
        reward = deck.get("reward")
        reward_view = None
        if reward:
            reward_view = {"resources": reward.get("resources", {}), "card": None}
            if reward.get("design_id"):
                reward_view["card"] = {"design_id": reward["design_id"], "name": design_names[reward["design_id"]],
                                       "finish_id": "holo", "slab_grade": reward.get("slab_grade")}
        result.append({"id": deck["id"], "kind": deck["kind"], "title": deck["title"], "theme": deck["theme"],
                       "description": deck["description"], "accent": deck["accent"], "slots": slots,
                       "filled": sum(slot["card"] is not None for slot in slots), "total": 3,
                       "claimed": deck["id"] in claimed, "reward": reward_view,
                       "analysis": _analysis(slots, power)})
    return result


def claim_reward(db, user_id, deck_id):
    definition = next((deck for deck in CURATED if deck["id"] == deck_id), None)
    game.need(definition is not None, "Curated deck not found", 404)
    game.need(not db.execute("SELECT 1 FROM deck_claims WHERE user_id=? AND deck_id=?", (user_id, deck_id)).fetchone(),
              "Deck reward already claimed", 409)
    deck = next(deck for deck in list_decks(db, user_id) if deck["id"] == deck_id)
    game.need(deck["filled"] == 3, "Complete this deck before claiming its reward")
    reward = definition["reward"]
    copy_id = None
    if reward.get("design_id"):
        copy_id = game.mint_copy(db, reward["design_id"], user_id, quality_override=80 if reward.get("slab_grade") else 88)
        if reward.get("slab_grade"):
            db.execute("UPDATE copies SET slab_grade=? WHERE id=?", (reward["slab_grade"], copy_id))
    game.adjust_resources(db, user_id, reward.get("resources", {}))
    db.execute("INSERT INTO deck_claims(user_id,deck_id,claimed_at,copy_id) VALUES(?,?,?,?)",
               (user_id, deck_id, game.stamp(), copy_id))
    return {"copy_id": copy_id, "resources": reward.get("resources", {})}
