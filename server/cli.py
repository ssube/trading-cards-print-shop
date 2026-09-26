"""Local administration: python -m server.cli --help"""
import argparse
import getpass
import json
from pathlib import Path

from . import game
from .db import connect, init, transaction


def add_cards(db, actor_id, recipient_id, cards, reason, title=None):
    game.need(isinstance(cards, list) and 1 <= len(cards) <= 24, "Add between 1 and 24 cards")
    game.need(reason and reason.strip(), "An audit reason is required")
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
    results = []
    for card in prepared:
        result = game.admin_action(db, actor_id, "create-design", card, reason)
        if recipient_id is not None:
            result.update(game.admin_action(db, actor_id, "print-copy",
                                            {"design_id": result["design_id"], "user_id": recipient_id}, reason))
        results.append({"name": card["name"], **result})
    if title:
        game.audit(db, actor_id, "add-set", title, reason,
                   {"theme_id": prepared[0]["theme_id"], "recipient_id": recipient_id,
                    "design_ids": [item["design_id"] for item in results]})
    return results


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
