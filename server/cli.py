"""Local administration: python -m server.cli --help"""
import argparse
import getpass
import json

from . import game
from .db import connect, init, transaction


def main():
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
    sub.add_parser("users", help="List players")
    sub.add_parser("audit", help="Show recent admin changes")
    args = parser.parse_args()
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
        elif args.command == "users":
            with connect() as db:
                print(json.dumps([dict(r) for r in db.execute("SELECT id,username,is_admin,created_at FROM users ORDER BY id")], indent=2))
        elif args.command == "audit":
            with connect() as db:
                print(json.dumps([dict(r) for r in db.execute("SELECT * FROM audit ORDER BY id DESC LIMIT 50")], indent=2))
    except (game.GameError, ValueError, KeyError) as exc:
        parser.exit(1, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
