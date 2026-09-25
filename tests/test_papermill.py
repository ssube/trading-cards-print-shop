import pytest

from server import db, decks, game, papermill, providers


@pytest.fixture
def user(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cards.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    db.init()
    game.seed()
    with db.transaction() as conn:
        return game.create_user(conn, "millkeeper", "long-enough-password")


def test_hiring_unlocks_exact_deck_and_claim_once(user):
    with db.transaction() as conn:
        papermill.status(conn, user)
        conn.execute("UPDATE papermills SET pulp=200 WHERE user_id=?", (user,))
        for _ in range(6):
            papermill.hire(conn, user)
        assert [row[0] for row in conn.execute("SELECT design_id FROM copies WHERE owner_id=? AND design_id LIKE 'mill-%' ORDER BY design_id", (user,))] == ["mill-apprentice", "mill-master", "mill-roller"]
        deck = next(item for item in decks.list_decks(conn, user) if item["id"] == "papermill")
        assert deck["filled"] == 3
        reward = decks.claim_reward(conn, user, "papermill")
        assert reward["copy_id"]
        with pytest.raises(game.GameError):
            decks.claim_reward(conn, user, "papermill")


def test_passive_output_is_capped_and_not_paid_twice(user):
    with db.transaction() as conn:
        papermill.status(conn, user)
        before = game.resource_balance(conn, user)
        conn.execute("UPDATE papermills SET cats=6, seconds_credit=43200 WHERE user_id=?", (user,))
        first = papermill.status(conn, user)
        middle = game.resource_balance(conn, user)
        second = papermill.status(conn, user)
        after = game.resource_balance(conn, user)
        assert first["paper_today"] == second["paper_today"] == 4
        assert first["ink_today"] == second["ink_today"] == 4
        assert middle == after
        assert after["paper"] == before["paper"] + 4
        assert after["ink"] == before["ink"] + 4
