from datetime import timedelta

import pytest

from server import db, game, providers, shooter


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cards.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    db.init()
    game.seed()
    with db.transaction() as conn:
        player = game.create_user(conn, "shooter", "very-long-password")
    return player


def backdate(conn, run_id):
    conn.execute("UPDATE shooter_runs SET started_at=?,last_kill_at=NULL WHERE id=?",
                 ((game.now() - timedelta(minutes=2)).isoformat(), run_id))


def test_shooter_caps_rewards_and_grants_one_boss_card(world):
    with db.transaction() as conn:
        before = game.resource_balance(conn, world)
        for run_index in range(3):
            run = shooter.start_run(conn, world)
            backdate(conn, run["id"])
            for enemy_index in range(3):
                result = shooter.claim_kill(conn, world, run["id"], enemy_index)
                assert result["resource"] is not None if run_index < 2 else result["resource"] is None
                with pytest.raises(game.GameError):
                    shooter.claim_kill(conn, world, run["id"], enemy_index)
                conn.execute("UPDATE shooter_runs SET last_kill_at=NULL WHERE id=?", (run["id"],))
            result = shooter.claim_boss(conn, world, run["id"])
            assert bool(result["copy_id"]) == (run_index == 0)
            with pytest.raises(game.GameError):
                shooter.claim_boss(conn, world, run["id"])
        with pytest.raises(game.GameError):
            shooter.start_run(conn, world)
        state = shooter.status(conn, world)
        assert state["resources_earned"] == 6
        assert state["boss_card_claimed"]
        assert state["runs_used"] == 3
        assert conn.execute("SELECT COUNT(*) FROM copies WHERE owner_id=? AND design_id LIKE 'demon-%'", (world,)).fetchone()[0] == 1
        after = game.resource_balance(conn, world)
        assert after["paper"] + after["ink"] - before["paper"] - before["ink"] == 6


def test_shooter_requires_sequence_and_ownership(world):
    with db.transaction() as conn:
        run = shooter.start_run(conn, world)
        with pytest.raises(game.GameError):
            shooter.claim_boss(conn, world, run["id"])
        with pytest.raises(game.GameError):
            shooter.claim_kill(conn, world, run["id"], True)
        with pytest.raises(game.GameError):
            shooter.claim_kill(conn, world, run["id"], 0)
        backdate(conn, run["id"])
        with pytest.raises(game.GameError):
            shooter.claim_kill(conn, world + 1, run["id"], 0)
        assert shooter.claim_kill(conn, world, run["id"], 0)["enemy_index"] == 0
