from pathlib import Path

import pytest

from server import db, game, tcg


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", Path(tmp_path) / "tcg.sqlite3")
    monkeypatch.setattr(tcg.random, "shuffle", lambda cards: None)
    db.init()
    game.seed()
    with db.transaction() as conn:
        alice = game.create_user(conn, "tcg_alice", "long-password-123")
        bob = game.create_user(conn, "tcg_bob", "long-password-123", starter_deck_id="starlit")
        a = [row[0] for row in conn.execute("SELECT id FROM copies WHERE owner_id=?", (alice,))]
        b = [row[0] for row in conn.execute("SELECT id FROM copies WHERE owner_id=?", (bob,))]
    return alice, bob, a, b


def test_private_hands_board_actions_and_staged_spell(world):
    alice, bob, a, b = world
    with db.transaction() as conn:
        # Put a Spell in the opening hand to verify place, then activate.
        a.sort(key=lambda cid: 0 if game.copy_detail(conn, cid)["type_id"] == "spell" else 1)
        room = tcg.create(conn, alice, "tcg_alice", a, "starter")
        with pytest.raises(game.GameError, match="private"):
            tcg.state(conn, bob, room["code"])
        joined = tcg.join(conn, bob, "tcg_bob", room["code"], b)
        hidden = joined["players"][0]["cards"]
        assert not hidden and joined["players"][0]["hand_count"] == 4
        mine = tcg.state(conn, alice, room["code"])
        assert all(card["zone"] == "hand" for card in mine["players"][0]["cards"])
        spell = next(card for card in mine["players"][0]["cards"] if card["type_id"] == "spell")
        placed = tcg.action(conn, alice, room["code"], mine["revision"], "place", spell["id"], 2)
        assert placed["players"][0]["cards"] and placed["actions_left"] == 1
        bob_view = tcg.state(conn, bob, room["code"])
        assert next(card for card in bob_view["players"][0]["cards"] if card["zone"] == "board")["name"] == spell["name"]
        activated = tcg.action(conn, alice, room["code"], placed["revision"], "activate", spell["id"])
        assert any(card["id"] == spell["id"] and card["zone"] == "discard" for card in activated["players"][0]["cards"])
        assert activated["active_seat"] == 1
        with pytest.raises(game.GameError, match="changed"):
            tcg.action(conn, bob, room["code"], placed["revision"], "pass")


def test_bot_goal_rewards_and_ownership(world):
    alice, bob, a, _ = world
    with db.transaction() as conn:
        room = tcg.create(conn, alice, "tcg_alice", a, "starter", bot=True)
        assert room["goal"] == 5 and room["status"] == "active"
        assert not room["players"][1]["cards"]
        with pytest.raises(game.GameError, match="private"):
            tcg.state(conn, bob, room["code"])
        state = tcg._load(conn, room["code"])
        monster = next(card for card in state["players"][0]["cards"] if card["type_id"] == "monster")
        monster["zone"], monster["slot"] = "board", 2
        state["players"][0]["sparks"] = 3
        tcg._save(conn, state)
        result = tcg.action(conn, alice, room["code"], state["revision"], "attack", monster["id"])
        assert result["status"] == "finished" and result["winner"] == 0
        reward = result["rewards"]["0"]
        assert reward["resources"]["paper"] >= 1
        assert conn.execute("SELECT COUNT(*) FROM tcg_rewards WHERE code=?", (room["code"],)).fetchone()[0] == 1
        assert tcg.state(conn, alice, room["code"])["rewards"] == result["rewards"]
        assert conn.execute("SELECT COUNT(*) FROM tcg_rewards WHERE code=?", (room["code"],)).fetchone()[0] == 1


def test_formats_and_print_cost_matching(world):
    alice, bob, a, b = world
    with db.transaction() as conn:
        with pytest.raises(game.GameError, match="exact number"):
            tcg.create(conn, alice, "tcg_alice", a, "intermediate")
        room = tcg.create(conn, alice, "tcg_alice", a, "starter")
        # Same-size starter decks can join despite different physical finishes.
        assert tcg.join(conn, bob, "tcg_bob", room["code"], b)["goal"] == 5
        with pytest.raises(game.GameError, match="6 to 12"):
            tcg.create(conn, alice, "tcg_alice", a[:5], "starter")


def test_both_players_earn_by_sparks_but_only_winner_can_win_a_card(world, monkeypatch):
    alice, bob, a, b = world
    monkeypatch.setattr(tcg.secrets, "randbelow", lambda _: 0)
    with db.transaction() as conn:
        room = tcg.create(conn, alice, "tcg_alice", a, "starter")
        tcg.join(conn, bob, "tcg_bob", room["code"], b)
        state = tcg._load(conn, room["code"])
        state["players"][0]["sparks"] = 5
        state["players"][1]["sparks"] = 3
        state["winner"] = 0
        state["status"] = "finished"
        tcg._award(conn, state)
        assert state["rewards"]["0"]["resources"] == {"paper": 3, "ink": 2}
        assert state["rewards"]["1"]["resources"] == {"paper": 2, "ink": 1}
        assert state["rewards"]["0"]["copy_id"]
        assert state["rewards"]["1"]["copy_id"] is None
        first_balance = game.resource_balance(conn, alice)
        tcg._award(conn, state)
        assert game.resource_balance(conn, alice) == first_balance
        assert conn.execute("SELECT COUNT(*) FROM tcg_rewards WHERE code=?", (room["code"],)).fetchone()[0] == 2
