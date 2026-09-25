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
            recipe = {"type_id": "land", "rule_ids": ["dusk", "grow"], "theme_id": "celestial", "finish_id": "standard",
                      "border_id": "starlit", "back_id": "atlas"}
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
            printed = (await client.get(f"/api/copies/{job['copy_id']}")).json()
            assert (printed["border_id"], printed["back_id"]) == ("starlit", "atlas")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as guest:
                assert (await guest.get(f"/api/copies/{job['copy_id']}")).status_code == 401
                shared = (await guest.get(f"/api/public/cards/{job['copy_id']}")).json()
                assert shared["id"] == printed["id"]
                assert shared["name"] == printed["name"]
                assert shared["owner_id"] is None
                assert shared["exact_grade_visible"] is False
                assert (await guest.get("/api/public/cards/unknown-copy")).status_code == 404
            library = (await client.get("/api/state")).json()["library"]
            assert len(library) == 4
            assert {card["design_id"] for card in library} >= {"npc-starlit-map", "starter-paper-sprite"}
            assert any(card["border_id"] == "starlit" and card["back_id"] == "atlas" for card in library)
            assert all(card["art_path"].startswith("/assets/") for card in library)
            progress = (await client.get("/api/state")).json()["collection_progress"]
            assert progress["cards"] == {"collected": 4, "total": 39, "percent": 10}
            deck_list = (await client.get("/api/decks")).json()
            assert len(deck_list) == 10
            assert next(deck for deck in deck_list if deck["id"] == "starlit")["filled"] == 3
            assert (await client.post("/api/decks", json={"title": "Star Friends", "theme": "celestial"})).status_code == 403
            custom = await client.post("/api/decks", json={"title": "Star Friends", "theme": "celestial"}, headers={"X-CSRF-Token": csrf})
            assert custom.status_code == 200
            custom_id = custom.json()["id"]
            assert (await client.put(f"/api/decks/{custom_id}", json={"title": "New Stars", "theme": "storybook"}, headers={"X-CSRF-Token": csrf})).status_code == 200
            assert (await client.delete(f"/api/decks/{custom_id}", headers={"X-CSRF-Token": csrf})).status_code == 200
            claimed = await client.post("/api/decks/starlit/claim", headers={"X-CSRF-Token": csrf})
            assert claimed.status_code == 200
            assert (await client.get(f"/api/copies/{claimed.json()['copy_id']}")).json()["design_id"] == "reward-starlit-map-holo"
            assert (await client.post("/api/decks/starlit/claim", headers={"X-CSRF-Token": csrf})).status_code == 409

    asyncio.run(scenario())


def test_minigame_routes_and_private_table(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "minigames.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    db.init()
    game.seed()

    async def scenario():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as alice, \
                   httpx.AsyncClient(transport=transport, base_url="http://test") as bob:
            a = (await alice.post("/api/auth/register", json={"username": "game_alice", "password": "long-password-123", "starter_deck_id": "pressroom"})).json()
            b = (await bob.post("/api/auth/register", json={"username": "game_bob", "password": "long-password-123", "starter_deck_id": "starlit"})).json()
            ah, bh = {"X-CSRF-Token": a["csrf"]}, {"X-CSRF-Token": b["csrf"]}
            assert (await alice.post("/api/games/papermill/tap")).status_code == 403
            assert (await alice.get("/api/games/papermill")).json()["cats"] == 0
            assert (await alice.get("/api/games/fishing")).json()["limit"] == 5
            assert (await alice.post("/api/games/fishing/cast", headers=ah)).status_code == 200
            assert (await alice.get("/api/games/shooter")).json()["run_limit"] == 3
            assert (await alice.post("/api/games/shooter/runs", headers=ah)).status_code == 200
            cards_a = [card["id"] for card in (await alice.get("/api/state")).json()["library"]]
            cards_b = [card["id"] for card in (await bob.get("/api/state")).json()["library"]]
            practice = await alice.post("/api/tabletop/practice", headers=ah, json={"action": "place", "copy_id": cards_a[0]})
            assert practice.status_code == 200
            assert practice.json()["practice"]["step"] == 1
            room = await alice.post("/api/tabletop/rooms", headers=ah, json={"copy_ids": cards_a})
            assert room.status_code == 200
            code = room.json()["code"]
            assert (await bob.get(f"/api/tabletop/rooms/{code}")).status_code == 403
            joined = await bob.post(f"/api/tabletop/rooms/{code}/join", headers=bh, json={"copy_ids": cards_b})
            assert joined.status_code == 200
            assert all(card["copy_id"] is None for card in joined.json()["cards"] if card["user_id"] == a["id"])
            assert (await alice.post(f"/api/tabletop/rooms/{code}/actions", json={"expected_revision": 1, "action": "pass"})).status_code == 403
            assert (await alice.post(f"/api/tabletop/rooms/{code}/actions", headers=ah, json={"expected_revision": 1, "action": "pass"})).status_code == 200
    asyncio.run(scenario())
