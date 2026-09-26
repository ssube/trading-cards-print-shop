"""Local administration: python -m server.cli --help"""
import argparse
import getpass
import json
import re
from pathlib import Path

from . import game, providers
from .db import connect, init, transaction


def prepare_cards(db, cards):
    game.need(isinstance(cards, list) and 1 <= len(cards) <= 24, "Add between 1 and 24 cards")
    prepared = []
    for card in cards:
        game.need(isinstance(card, dict), "Each card must be a JSON object")
        name = card.get("name")
        flavor = card.get("flavor", "A curious edition from the archives.")
        game.need(isinstance(name, str) and 1 <= len(name.strip()) <= 48, "Card name must be 1–48 characters")
        game.need(isinstance(flavor, str) and 1 <= len(flavor.strip()) <= 140, "Card flavor must be 1–140 characters")
        allowed = {"name", "flavor", "type_id", "rule_ids", "theme_id", "finish_id", "border_id", "back_id"}
        game.need(not set(card) - allowed, "Unknown card field")
        card = {"type_id": "monster", "rule_ids": ["arrival", "draw"], "theme_id": "storybook",
                "finish_id": "standard", "border_id": "classic", "back_id": "archive",
                **card, "name": name.strip(), "flavor": flavor.strip()}
        rules = card["rule_ids"]
        game.need(isinstance(rules, list) and 2 <= len(rules) <= 3 and
                  all(isinstance(rule, str) for rule in rules) and len(set(rules)) == len(rules),
                  "Choose two or three distinct rules")
        selected = [(card[key], kind) for key, kind in (("type_id", "type"), ("theme_id", "theme"),
                    ("finish_id", "finish"), ("border_id", "border"), ("back_id", "back"))]
        selected += [(rule, "rule") for rule in rules]
        parts = []
        for part_id, kind in selected:
            game.need(isinstance(part_id, str), f"Invalid {kind}")
            part = db.execute("SELECT kind,active,slot,power FROM parts WHERE id=?", (part_id,)).fetchone()
            game.need(part is not None and part["kind"] == kind and part["active"], f"Invalid {kind}: {part_id}")
            parts.append(part)
        slots = [part["slot"] for part in parts[5:]]
        game.need(slots.count("trigger") == 1 and slots.count("effect") == 1 and slots.count("condition") <= 1,
                  "Rules need one trigger, one effect, and at most one condition")
        game.need(sum(part["power"] for part in parts[5:]) <= 5, "The card exceeds its power limit")
        game.need(card["type_id"] != "spell" or "arrival" in rules, "Spells use the On arrival trigger")
        prepared.append(card)
    game.need(len({card["name"].casefold() for card in prepared}) == len(prepared), "Card names in a set must be distinct")
    return prepared


def add_cards(db, actor_id, recipient_id, cards, reason, title=None, generated=None, brief=None):
    game.need(reason and reason.strip(), "An audit reason is required")
    prepared = prepare_cards(db, cards)
    game.need(generated is None or len(generated) == len(prepared), "Generated artwork count does not match cards")
    results = []
    for index, card in enumerate(prepared):
        if generated is None:
            result = game.admin_action(db, actor_id, "create-design", card, reason)
        else:
            design_id, art_path = generated[index]
            db.execute("INSERT INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id,back_finish_id) "
                       "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (design_id, actor_id, card["type_id"], json.dumps(card["rule_ids"]), card["theme_id"],
                        card["finish_id"], card["name"], card["flavor"], art_path, game.stamp(),
                        card["border_id"], card["back_id"], "shimmer" if card["back_id"] == "mischief" else None))
            game.audit(db, actor_id, "create-design", design_id, reason, card)
            result = {"design_id": design_id}
        if recipient_id is not None:
            result.update(game.admin_action(db, actor_id, "print-copy",
                                            {"design_id": result["design_id"], "user_id": recipient_id}, reason))
        results.append({"name": card["name"], **result})
    if title:
        game.audit(db, actor_id, "add-set", title, reason,
                   {"theme_id": prepared[0]["theme_id"], "recipient_id": recipient_id, "brief": brief,
                    "design_ids": [item["design_id"] for item in results]})
    return results


def requested_mix(prompt, explicit_count=None):
    number = r"(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)"
    words = {word: index for index, word in enumerate(
        "zero one two three four five six seven eight nine ten eleven twelve".split())}
    def amount(value):
        return int(value) if value.isdigit() else words[value]
    total_match = re.search(rf"\b({number})\s+cards?\b", prompt, re.I)
    stated_total = amount(total_match[1].lower()) if total_match else None
    game.need(explicit_count is None or stated_total is None or explicit_count == stated_total,
              "--count conflicts with the set size in the prompt")
    total = explicit_count if explicit_count is not None else stated_total
    counts = {}
    for match in re.finditer(rf"\b({number})\s+(?:[a-z-]+\s+){{0,3}}?(monsters?|lands?|spells?)\b", prompt, re.I):
        kind = match[2].lower().rstrip("s")
        game.need(kind not in counts, f"Ambiguous {kind} count in prompt")
        counts[kind] = amount(match[1].lower())
    game.need(total is None or 1 <= total <= 24, "Set size must be 1–24 cards")
    game.need(not counts or total is None or sum(counts.values()) <= total, "Card type counts exceed set size")
    if total is None and set(counts) == {"monster", "land", "spell"}:
        total = sum(counts.values())
    return total, counts


def generate_cards(db, prompt, style, count=None):
    game.need(isinstance(prompt, str) and 1 <= len(prompt.strip()) <= 2000, "Prompt must be 1–2000 characters")
    theme = db.execute("SELECT name,description FROM parts WHERE id=? AND kind='theme' AND active=1", (style,)).fetchone()
    game.need(theme is not None, "Unknown built-in art style")
    total, counts = requested_mix(prompt, count)
    rules = [dict(row) for row in db.execute(
        "SELECT id,name,description,slot,power FROM parts WHERE kind='rule' AND active=1 ORDER BY id")]
    return theme, rules, total, counts


def validate_generated_set(plan, style, total, counts):
    game.need(isinstance(plan, dict) and isinstance(plan.get("title"), str) and
              1 <= len(plan["title"].strip()) <= 80 and isinstance(plan.get("cards"), list),
              "Text provider returned an invalid set")
    cards = plan["cards"]
    game.need(1 <= len(cards) <= 24 and (total is None or len(cards) == total), "Generated set has the wrong card count")
    game.need(all(isinstance(card, dict) for card in cards), "Text provider returned an invalid card")
    game.need(all(counts.get(kind, 0) == sum(card.get("type_id") == kind for card in cards)
                  for kind in counts), "Generated set has the wrong card type mix")
    game.need(all(isinstance(card.get("art_prompt"), str) and 1 <= len(card["art_prompt"].strip()) <= 500
                  for card in cards), "Each generated card needs an art prompt")
    clean = []
    for card in cards:
        game.need(set(card) == {"name", "flavor", "type_id", "rule_ids", "art_prompt"},
                  "Generated cards need name, flavor, type_id, rule_ids, and art_prompt")
        clean.append({key: value for key, value in card.items() if key != "art_prompt"} | {"theme_id": style})
    return plan["title"].strip(), clean


def main(argv=None):
    parser = argparse.ArgumentParser(description="Trading Cards: Print Shop administration")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Initialize and seed the database")
    admin = sub.add_parser("create-admin", help="Create the first admin locally")
    admin.add_argument("--username", required=True)
    action = sub.add_parser("action", help="Run a shared admin service action")
    action.add_argument("name", choices=["create-player", "grant-resource", "grant-part", "create-design",
                                         "update-design", "print-copy", "give-copy", "set-grade", "set-part", "set-commission", "set-npc-offer"])
    action.add_argument("--actor", required=True, help="Admin username")
    action.add_argument("--reason", required=True)
    action.add_argument("--data", required=True, help="JSON object for the action")
    card = sub.add_parser("add-card", help="Add one card design, optionally printing a copy for a player")
    card.add_argument("--actor", required=True)
    card.add_argument("--reason", required=True)
    card.add_argument("--to", help="Recipient username; omit for a design only")
    card.add_argument("--name", required=True)
    card.add_argument("--flavor")
    card.add_argument("--type-id", default="monster")
    card.add_argument("--rule-ids", nargs="+", default=["arrival", "draw"])
    card.add_argument("--theme-id", default="storybook")
    card.add_argument("--finish-id", default="standard")
    card.add_argument("--border-id", default="classic")
    card.add_argument("--back-id", default="archive")
    card_set = sub.add_parser("add-set", help="Add a themed set from a JSON manifest")
    card_set.add_argument("--actor", required=True)
    card_set.add_argument("--reason", required=True)
    card_set.add_argument("--to", help="Recipient username; omit for designs only")
    card_set.add_argument("--file", required=True, type=Path, help="JSON file with title, theme_id, and cards")
    generated_set = sub.add_parser("generate-set", help="Generate a themed set from a natural-language brief")
    generated_set.add_argument("--actor", required=True)
    generated_set.add_argument("--reason", required=True)
    generated_set.add_argument("--to", help="Recipient username; omit for designs only")
    generated_set.add_argument("--prompt", required=True, help="Set brief, including card count and mix")
    generated_set.add_argument("--style", required=True, help="Built-in art style ID, such as botanical")
    generated_set.add_argument("--count", type=int, help="Expected total if the brief does not state one")
    sub.add_parser("users", help="List players")
    sub.add_parser("audit", help="Show recent admin changes")
    args = parser.parse_args(argv)
    init()
    game.seed()
    try:
        if args.command == "init":
            print("Database initialized")
        elif args.command == "create-admin":
            with connect() as db:
                count = db.execute("SELECT COUNT(*) FROM users WHERE is_admin=1").fetchone()[0]
            if count:
                raise game.GameError("An admin already exists; use the admin interface to create another")
            password = getpass.getpass("New admin password: ")
            confirm = getpass.getpass("Confirm password: ")
            game.need(password == confirm, "Passwords do not match")
            with transaction() as db:
                user_id = game.create_user(db, args.username, password, True)
                game.audit(db, user_id, "create-admin", str(user_id), "initial local bootstrap")
            print(f"Admin {args.username} created (id {user_id})")
        elif args.command == "action":
            payload = json.loads(args.data)
            with transaction() as db:
                actor = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE AND is_admin=1", (args.actor,)).fetchone()
                game.need(actor is not None, "Admin actor not found")
                result = game.admin_action(db, actor[0], args.name, payload, args.reason)
            print(json.dumps(result, indent=2))
        elif args.command in {"add-card", "add-set"}:
            if args.command == "add-card":
                card_data = {"name": args.name, "type_id": args.type_id, "rule_ids": args.rule_ids,
                             "theme_id": args.theme_id, "finish_id": args.finish_id,
                             "border_id": args.border_id, "back_id": args.back_id}
                if args.flavor is not None:
                    card_data["flavor"] = args.flavor
                cards, title = [card_data], None
            else:
                manifest = json.loads(args.file.read_text())
                game.need(isinstance(manifest, dict) and set(manifest) == {"title", "theme_id", "cards"},
                          "Set file needs title, theme_id, and cards")
                title, theme_id, cards = manifest["title"], manifest["theme_id"], manifest["cards"]
                game.need(isinstance(title, str) and 1 <= len(title.strip()) <= 80, "Set title must be 1–80 characters")
                game.need(isinstance(theme_id, str) and isinstance(cards, list), "Invalid set theme or cards")
                game.need(all(isinstance(card, dict) for card in cards), "Each card must be a JSON object")
                game.need(all(card.get("theme_id", theme_id) == theme_id for card in cards),
                          "Every card in a set must use its theme_id")
                cards = [{**card, "theme_id": theme_id} for card in cards]
                title = title.strip()
            with transaction() as db:
                actor = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE AND is_admin=1", (args.actor,)).fetchone()
                game.need(actor is not None, "Admin actor not found")
                recipient = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE", (args.to,)).fetchone() if args.to else None
                game.need(not args.to or recipient is not None, "Recipient not found")
                results = add_cards(db, actor[0], recipient[0] if recipient else None, cards, args.reason, title)
            print(json.dumps({"set": title, "cards": results}, indent=2))
        elif args.command == "generate-set":
            game.need(isinstance(args.reason, str) and args.reason.strip(), "An audit reason is required")
            with connect() as db:
                actor = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE AND is_admin=1", (args.actor,)).fetchone()
                game.need(actor is not None, "Admin actor not found")
                recipient = db.execute("SELECT id FROM users WHERE username=? COLLATE NOCASE", (args.to,)).fetchone() if args.to else None
                game.need(not args.to or recipient is not None, "Recipient not found")
                theme, rules, total, counts = generate_cards(db, args.prompt, args.style, args.count)
                actor_id, recipient_id = actor[0], recipient[0] if recipient else None
            print("Planning the set...", flush=True)
            plan = providers.generate_set(args.prompt, {"id": args.style, "name": theme["name"],
                                                          "description": theme["description"]}, rules, total)
            title, cards = validate_generated_set(plan, args.style, total, counts)
            with connect() as db:
                # Validate all rules before spending on illustration requests.
                cards = prepare_cards(db, cards)
            generated = []
            try:
                for index, (card, source) in enumerate(zip(cards, plan["cards"]), 1):
                    print(f"Illustrating {index}/{len(cards)}: {card['name']}...", flush=True)
                    design_id = game.uid()
                    art_recipe = {**card, "hint": source["art_prompt"].strip(),
                                  "theme_name": theme["name"], "theme_description": theme["description"],
                                  "rules": [next(rule for rule in rules if rule["id"] == rid)
                                            for rid in card["rule_ids"]]}
                    art_path = providers.generate_art(design_id, art_recipe, card["name"])
                    generated.append((design_id, art_path))
                with transaction() as db:
                    actor = db.execute("SELECT id FROM users WHERE id=? AND is_admin=1", (actor_id,)).fetchone()
                    game.need(actor is not None, "Admin actor not found")
                    results = add_cards(db, actor_id, recipient_id, cards, args.reason, title, generated, args.prompt)
            except Exception:
                for design_id, art_path in generated:
                    path = providers.ASSETS / Path(art_path).name
                    if path.stem == design_id:
                        path.unlink(missing_ok=True)
                raise
            print(json.dumps({"set": title, "cards": results}, indent=2))
        elif args.command == "users":
            with connect() as db:
                print(json.dumps([dict(r) for r in db.execute("SELECT id,username,is_admin,created_at FROM users ORDER BY id")], indent=2))
        elif args.command == "audit":
            with connect() as db:
                print(json.dumps([dict(r) for r in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 50")], indent=2))
    except (game.GameError, ValueError, KeyError, OSError, TypeError) as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
