import asyncio

import httpx

from server import db, game, providers
from server.app import app


def test_http_auth_print_and_admin_boundary(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cards.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    monkeypatch.setenv("TEXT_PROVIDER", "demo")
    monkeypatch.setenv("IMAGE_PROVIDER", "demo")
    db.init()
    game.seed()

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/state")).status_code == 401
            decks = (await client.get("/api/starter-decks")).json()
            assert {deck["id"] for deck in decks} == {"pressroom", "starlit", "velvet"}
            assert all(all(card["border_id"] and card["back_id"] for card in deck["cards"]) for deck in decks)
            assert all(sum(card["copies"] for card in deck["cards"]) == 3 for deck in decks)
            assert all(sum(card["copies"] for card in deck["cards"] if card["finish_id"] != "standard") == 1 for deck in decks)
            assert (await client.post("/api/auth/register", json={"username": "invalid", "password": "long-password-123",
                                                                   "starter_deck_id": "unknown"})).status_code == 400
            registration = await client.post("/api/auth/register", json={"username": "player", "password": "long-password-123",
                                                                     "starter_deck_id": "starlit"})
            assert registration.status_code == 200
            assert registration.json()["starter_deck_id"] == "starlit"
            csrf = registration.json()["csrf"]
            recipe = {"type_id": "land", "rule_ids": ["dusk", "grow"], "theme_id": "celestial", "finish_id": "standard"}
            assert (await client.post("/api/prints", json=recipe, headers={"Idempotency-Key": "http-print-123"})).status_code == 403
            assert (await client.post("/api/admin/actions", json={"action": "grant-resource", "payload": {"user_id": 1, "kind": "paper", "amount": 5}, "reason": "test"},
                                      headers={"X-CSRF-Token": csrf})).status_code == 403
            response = await client.post("/api/prints", json=recipe, headers={"Idempotency-Key": "http-print-123", "X-CSRF-Token": csrf})
            assert response.status_code == 200
            job_id = response.json()["id"]
            for _ in range(50):
                job = (await client.get(f"/api/jobs/{job_id}")).json()
                if job["status"] in {"complete", "failed"}:
                    break
                await asyncio.sleep(.02)
            assert job["status"] == "complete", job
            library = (await client.get("/api/state")).json()["library"]
            assert len(library) == 4
            assert {card["design_id"] for card in library} >= {"npc-starlit-map", "starter-paper-sprite"}
            assert any(card["border_id"] == "starlit" and card["back_id"] == "atlas" for card in library)
            assert all(card["art_path"].startswith("/assets/") for card in library)
            progress = (await client.get("/api/state")).json()["collection_progress"]
            assert progress["cards"] == {"collected": 4, "total": 12, "percent": 33}

    asyncio.run(scenario())
