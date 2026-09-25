"""Fishing rewards and cast accounting."""

from datetime import datetime, timedelta, timezone

import pytest

from server import db, fishing, game, providers


@pytest.fixture
def pond(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cards.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    db.init()
    game.seed()
    with db.transaction() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS fishing_casts(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),"
                     "day TEXT NOT NULL,created_at TEXT NOT NULL,target_ms INTEGER NOT NULL,tolerance_ms INTEGER NOT NULL,"
                     "prize_kind TEXT NOT NULL,prize_value TEXT NOT NULL,resolved_at TEXT,success INTEGER,reward_json TEXT)")
        for design_id in fishing.FISH_DESIGNS:
            conn.execute("INSERT OR IGNORE INTO designs(id,creator_id,type_id,rule_ids,theme_id,finish_id,name,flavor,art_path,created_at,border_id,back_id) "
                         "SELECT ?,NULL,type_id,rule_ids,theme_id,finish_id,?,flavor,art_path,created_at,border_id,back_id "
                         "FROM designs WHERE id='npc-tideglass-portal'", (design_id, design_id))
        alice = game.create_user(conn, "angler", "password123")
        bob = game.create_user(conn, "observer", "password123")
    clock = [datetime(2026, 9, 25, 12, tzinfo=timezone.utc)]
    monkeypatch.setattr(game, "now", lambda: clock[0])
    return alice, bob, clock


def test_successful_resource_catch_is_idempotent(pond, monkeypatch):
    alice, bob, clock = pond
    monkeypatch.setattr(fishing.secrets, "randbelow", lambda _n: 1)
    with db.transaction() as conn:
        before = game.resource_balance(conn, alice)["ink"]
        started = fishing.cast(conn, alice)
        cast_id = started["pending"]["cast_id"]
        assert started["used"] == 1
        assert fishing.cast(conn, alice)["pending"]["cast_id"] == cast_id
        with pytest.raises(game.GameError, match="not found"):
            fishing.reel(conn, bob, cast_id)
        clock[0] += timedelta(milliseconds=1401)
        result = fishing.reel(conn, alice, cast_id)
        assert result == {"cast_id": cast_id, "success": True, "reward": {"resources": {"ink": 2}}}
        assert fishing.reel(conn, alice, cast_id) == result
        assert game.resource_balance(conn, alice)["ink"] == before + 2
        assert fishing.state(conn, alice)["catches"] == 1


def test_rare_fish_is_minted_once(pond, monkeypatch):
    alice, _, clock = pond
    values = iter((0, 0, 0))
    monkeypatch.setattr(fishing.secrets, "randbelow", lambda _n: next(values))
    with db.transaction() as conn:
        cast_id = fishing.cast(conn, alice)["pending"]["cast_id"]
        clock[0] += timedelta(milliseconds=1400)
        result = fishing.reel(conn, alice, cast_id)
        copy_id = result["reward"]["card"]["copy_id"]
        assert result["reward"]["card"]["design_id"] == "fish-lanternfin"
        assert game.copy_detail(conn, copy_id, alice)["owner_id"] == alice
        assert fishing.reel(conn, alice, cast_id) == result
        assert conn.execute("SELECT COUNT(*) FROM copies WHERE design_id='fish-lanternfin' AND owner_id=?", (alice,)).fetchone()[0] == 1


def test_misses_and_expired_casts_consume_daily_quota(pond, monkeypatch):
    alice, _, clock = pond
    monkeypatch.setattr(fishing.secrets, "randbelow", lambda _n: 1)
    with db.transaction() as conn:
        fishing.cast(conn, alice)
        assert fishing.reel(conn, alice, fishing.state(conn, alice)["pending"]["cast_id"])["success"] is False
        fishing.cast(conn, alice)
        clock[0] += timedelta(milliseconds=fishing.CAST_LIFETIME_MS)
        assert fishing.state(conn, alice)["pending"] is None
        assert fishing.state(conn, alice)["used"] == 2
        for _ in range(3):
            cast_id = fishing.cast(conn, alice)["pending"]["cast_id"]
            assert fishing.reel(conn, alice, cast_id)["success"] is False
        assert fishing.state(conn, alice)["used"] == 5
        with pytest.raises(game.GameError, match="five casts"):
            fishing.cast(conn, alice)
        clock[0] += timedelta(days=1)
        assert fishing.state(conn, alice)["used"] == 0
