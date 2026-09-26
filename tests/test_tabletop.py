import pytest

from server import db, game, tabletop


@pytest.fixture
def players(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "tabletop.sqlite3")
    db.init()
    game.seed()
    with db.transaction() as conn:
        alice = game.create_user(conn, "table_alice", "very-long-password")
        bob = game.create_user(conn, "table_bob", "another-long-password")
        alice_cards = [r[0] for r in conn.execute("SELECT id FROM copies WHERE owner_id=? LIMIT 3", (alice,))]
        bob_cards = [r[0] for r in conn.execute("SELECT id FROM copies WHERE owner_id=? LIMIT 3", (bob,))]
    return alice, bob, alice_cards, bob_cards


def test_practice_has_ordered_one_time_card_rewards(players):
    alice, _, cards, _ = players
    with db.transaction() as conn:
        with pytest.raises(game.GameError):
            tabletop.practice_action(conn, alice, "attack")
        assert tabletop.practice_action(conn, alice, "place", cards[0])["practice"]["step"] == 1
        assert tabletop.practice_action(conn, alice, "attack")["practice"]["step"] == 2
        assert tabletop.practice_action(conn, alice, "score")["practice"]["step"] == 3
        with pytest.raises(game.GameError):
            tabletop.practice_action(conn, alice, "score")
        assert conn.execute("SELECT count(*) FROM copies WHERE owner_id=? AND design_id LIKE 'tabletop-%'", (alice,)).fetchone()[0] == 3


def test_private_hands_turns_and_revision(players):
    alice, bob, alice_cards, bob_cards = players
    with db.transaction() as conn:
        room = tabletop.create_room(conn, alice, alice_cards)
        code = room["code"]
        with pytest.raises(game.GameError):
            tabletop.room_state(conn, bob, code)
        tabletop.join_room(conn, bob, code, bob_cards)
        alice_view = tabletop.room_state(conn, alice, code)
        hidden = [card for card in alice_view["cards"] if card["user_id"] == bob]
        assert len(hidden) == 3 and all(card["copy_id"] is None and card["card"] is None for card in hidden)
        with pytest.raises(game.GameError):
            tabletop.room_action(conn, bob, code, alice_view["revision"], "pass")
        updated = tabletop.room_action(conn, alice, code, alice_view["revision"], "place", copy_id=alice_cards[0], x=1, y=1)
        with pytest.raises(game.GameError):
            tabletop.room_action(conn, alice, code, alice_view["revision"], "pass")
        bob_view = tabletop.room_state(conn, bob, code)
        placed = next(card for card in bob_view["cards"] if card["user_id"] == alice and card["zone"] == "table")
        assert placed["card"]["name"] and placed["copy_id"] == alice_cards[0]
        updated = tabletop.room_action(conn, alice, code, updated["revision"], "pass")
        assert updated["active_player"] == 1
        assert tabletop.room_action(conn, bob, code, updated["revision"], "pass")["active_player"] == 0
