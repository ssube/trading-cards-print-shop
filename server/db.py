import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(os.getenv("DATABASE_PATH", "./data/cards.sqlite3"))


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=30000")
    db.execute("PRAGMA journal_mode=WAL")
    return db


@contextmanager
def transaction():
    db = connect()
    try:
        db.execute("BEGIN IMMEDIATE")
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init():
    with transaction() as db:
        version = db.execute("PRAGMA user_version").fetchone()[0]
        if version >= 8:
            return
        if version == 0:
            db.executescript("""
        CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
        CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE parts(id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
          description TEXT NOT NULL, power INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE learned(user_id INTEGER NOT NULL REFERENCES users(id), part_id TEXT NOT NULL REFERENCES parts(id),
          PRIMARY KEY(user_id,part_id));
        CREATE TABLE resources(user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK(amount>=0), PRIMARY KEY(user_id,kind));
        CREATE TABLE designs(id TEXT PRIMARY KEY, creator_id INTEGER REFERENCES users(id),
          type_id TEXT NOT NULL, rule_ids TEXT NOT NULL, theme_id TEXT NOT NULL, finish_id TEXT NOT NULL,
          name TEXT NOT NULL, flavor TEXT NOT NULL, art_path TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE copies(id TEXT PRIMARY KEY, design_id TEXT NOT NULL REFERENCES designs(id),
          owner_id INTEGER REFERENCES users(id), origin_id TEXT, created_at TEXT NOT NULL,
          print_score INTEGER NOT NULL, centering_x REAL NOT NULL, centering_y REAL NOT NULL,
          shift_c REAL NOT NULL, shift_m REAL NOT NULL, shift_y REAL NOT NULL, shift_k REAL NOT NULL,
          color_effect TEXT NOT NULL, surface REAL NOT NULL, edge REAL NOT NULL, condition INTEGER NOT NULL DEFAULT 100,
          aged_at TEXT NOT NULL, sleeved INTEGER NOT NULL DEFAULT 0, slab_grade INTEGER,
          listed INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE jobs(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          kind TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
          design_id TEXT, copy_id TEXT, created_at TEXT NOT NULL);
        CREATE TABLE commissions(id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL,
          requirement TEXT NOT NULL, reward TEXT NOT NULL, repeatable INTEGER NOT NULL DEFAULT 0,
          daily INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE commission_claims(user_id INTEGER NOT NULL REFERENCES users(id), commission_id TEXT NOT NULL,
          day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(user_id,commission_id,day));
        CREATE TABLE npc_offers(id TEXT PRIMARY KEY, npc_name TEXT NOT NULL, title TEXT NOT NULL,
          requirement TEXT NOT NULL, reward TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE npc_claims(user_id INTEGER NOT NULL REFERENCES users(id), offer_id TEXT NOT NULL,
          day TEXT NOT NULL, PRIMARY KEY(user_id,offer_id,day));
        CREATE TABLE listings(id TEXT PRIMARY KEY, seller_id INTEGER NOT NULL REFERENCES users(id),
          copy_id TEXT NOT NULL REFERENCES copies(id), wish TEXT NOT NULL, status TEXT NOT NULL,
          created_at TEXT NOT NULL);
        CREATE TABLE offers(id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id),
          buyer_id INTEGER NOT NULL REFERENCES users(id), copy_ids TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE audit(id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id),
          action TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL,
          created_at TEXT NOT NULL);
        CREATE TABLE activity_claims(user_id INTEGER NOT NULL REFERENCES users(id), activity TEXT NOT NULL,
          claim_key TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(user_id,activity,claim_key));
            PRAGMA user_version=1;
            """)
        if version <= 1:
            db.execute("ALTER TABLE parts ADD COLUMN slot TEXT NOT NULL DEFAULT ''")
            db.execute("PRAGMA user_version=2")
        if version <= 2:
            db.execute("ALTER TABLE parts ADD COLUMN cost_json TEXT NOT NULL DEFAULT '{}'")
            db.execute("PRAGMA user_version=3")
        if version <= 3:
            db.execute("ALTER TABLE users ADD COLUMN starter_deck_id TEXT")
            db.execute("PRAGMA user_version=4")
        if version <= 4:
            db.execute("ALTER TABLE designs ADD COLUMN border_id TEXT NOT NULL DEFAULT 'classic'")
            db.execute("ALTER TABLE designs ADD COLUMN back_id TEXT NOT NULL DEFAULT 'archive'")
            db.execute("PRAGMA user_version=5")

        if version <= 5:
            db.execute("CREATE TABLE custom_decks(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, theme_id TEXT NOT NULL REFERENCES parts(id), created_at TEXT NOT NULL)")
            db.execute("CREATE TABLE deck_claims(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, deck_id TEXT NOT NULL, claimed_at TEXT NOT NULL, copy_id TEXT REFERENCES copies(id), PRIMARY KEY(user_id,deck_id))")
            db.execute("PRAGMA user_version=6")

        if version <= 6:
            db.execute("CREATE TABLE papermills(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, pulp INTEGER NOT NULL DEFAULT 0, cats INTEGER NOT NULL DEFAULT 0, roller INTEGER NOT NULL DEFAULT 0, ink_vat INTEGER NOT NULL DEFAULT 0, seconds_credit INTEGER NOT NULL DEFAULT 0, last_at TEXT NOT NULL, day TEXT NOT NULL, paper_today INTEGER NOT NULL DEFAULT 0, ink_today INTEGER NOT NULL DEFAULT 0, last_tap_at TEXT)")
            db.execute("PRAGMA user_version=7")

        if version <= 7:
            db.execute("CREATE TABLE fishing_casts(id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, created_at TEXT NOT NULL, target_ms INTEGER NOT NULL, tolerance_ms INTEGER NOT NULL, prize_kind TEXT NOT NULL, prize_value TEXT NOT NULL, resolved_at TEXT, success INTEGER, reward_json TEXT)")
            db.execute("CREATE INDEX fishing_casts_user_day ON fishing_casts(user_id,day)")
            db.execute("PRAGMA user_version=8")
