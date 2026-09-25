import json

import pytest

from server import db, game, providers


@pytest.fixture
def world(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cards.sqlite3")
    monkeypatch.setattr(providers, "ASSETS", tmp_path / "assets")
    monkeypatch.setenv("TEXT_PROVIDER", "demo")
    monkeypatch.setenv("IMAGE_PROVIDER", "demo")
    db.init()
    game.seed()
    with db.transaction() as conn:
        alice = game.create_user(conn, "alice", "very-long-password")
        bob = game.create_user(conn, "bob", "another-long-password")
    return alice, bob


def new_card(owner, key="unique-print-key"):
    with db.transaction() as conn:
        job = game.create_print_job(conn, owner, {"type_id": "monster", "rule_ids": ["arrival", "draw"],
                                                  "theme_id": "storybook", "finish_id": "standard"}, key)
    providers.process_job(job["id"])
    with db.connect() as conn:
        return conn.execute("SELECT copy_id FROM jobs WHERE id=?", (key,)).fetchone()[0]


def test_print_is_idempotent_and_failed_generation_refunds(world, monkeypatch):
    alice, _ = world
    first = new_card(alice)
    with db.transaction() as conn:
        before = game.resource_balance(conn, alice)
        repeat = game.create_print_job(conn, alice, {"type_id": "monster", "rule_ids": ["arrival", "draw"],
                                                    "theme_id": "storybook", "finish_id": "standard"}, "unique-print-key")
        assert repeat["copy_id"] == first
        assert game.resource_balance(conn, alice) == before
        pending = game.create_print_job(conn, alice, {"type_id": "monster", "rule_ids": ["arrival", "draw"],
                                                     "theme_id": "storybook", "finish_id": "standard"}, "failure-key-123")
    def broken(*_args):
        raise RuntimeError("provider offline")
    monkeypatch.setattr(providers, "generate_art", broken)
    providers.process_job(pending["id"])
    with db.connect() as conn:
        assert conn.execute("SELECT status FROM jobs WHERE id=?", (pending["id"],)).fetchone()[0] == "failed"
        assert game.resource_balance(conn, alice) == before


def test_trade_study_reprint_and_admin_audit(world):
    alice, bob = world
    alice_card = new_card(alice, "alice-print-123")
    bob_card = new_card(bob, "bob-print-12345")
    with db.transaction() as conn:
        listing = game.make_listing(conn, alice, alice_card, "Any curious card")
        offer = game.make_offer(conn, bob, listing, [bob_card])
        game.accept_offer(conn, alice, offer)
        assert game.copy_detail(conn, alice_card)["owner_id"] == bob
        assert game.copy_detail(conn, bob_card)["owner_id"] == alice
        game.study(conn, bob, alice_card)
        reprint = game.reprint(conn, bob, alice_card)
        assert game.copy_detail(conn, reprint)["origin_id"] == alice_card
        with pytest.raises(game.GameError):
            game.admin_action(conn, alice, "grant-resource", {"user_id": bob, "kind": "foil", "amount": 2}, "test reward")
        conn.execute("UPDATE users SET is_admin=1 WHERE id=?", (alice,))
        result = game.admin_action(conn, alice, "grant-resource", {"user_id": bob, "kind": "foil", "amount": 2}, "test reward")
        assert result["balance"]["foil"] == 2
        assert conn.execute("SELECT action FROM audit ORDER BY id DESC LIMIT 1").fetchone()[0] == "grant-resource"


def test_grading_protection_and_special_commissions(world):
    alice, _ = world
    card_id = new_card(alice, "grade-print-123")
    with db.transaction() as conn:
        conn.execute("UPDATE copies SET aged_at='2025-01-01' WHERE id=?", (card_id,))
        card = game.copy_detail(conn, card_id, alice)
        assert card["condition"] == 70  # capped aging
        game.adjust_resources(conn, alice, {"sleeve": 2})
        game.sleeve(conn, alice, card_id)
        game.wear(conn, card_id, 10)
        assert game.copy_detail(conn, card_id)["condition"] == 70
        with pytest.raises(game.GameError):
            game.commission_claim(conn, alice, "slab-display", card_id)
        certified = game.certify(conn, alice, card_id)
        assert certified == game.copy_detail(conn, card_id)["grade"]
        assert game.copy_detail(conn, card_id)["slab_grade"] == certified
        with pytest.raises(game.GameError):
            game.reprint(conn, alice, card_id)
        game.crack(conn, alice, card_id)
        assert game.copy_detail(conn, card_id)["slab_grade"] is None
        conn.execute("UPDATE copies SET condition=0 WHERE id=?", (card_id,))
        with pytest.raises(game.GameError):
            game.study(conn, alice, card_id)


def test_npc_copy_unlocks_parts_and_commission_consumes(world, monkeypatch):
    alice, _ = world
    monkeypatch.setattr(game, "npc_offer_available", lambda *_: True)
    card_id = new_card(alice, "npc-print-12345")
    with db.transaction() as conn:
        conn.execute("UPDATE copies SET print_score=95 WHERE id=?", (card_id,))
        npc_reward = game.npc_trade(conn, alice, "fox-copy", card_id)
        fox_copy = npc_reward["copy_id"]
        learned = game.study(conn, alice, fox_copy)
        assert {"absurd", "sleeved", "echo"} <= set(learned)
        claim = game.commission_claim(conn, alice, "first-edition", fox_copy)
        assert claim["paper"] == 3
        assert game.copy_detail(conn, fox_copy)["owner_id"] is None


def test_daily_allowance_is_unique(world):
    alice, _ = world
    with db.transaction() as conn:
        before = game.resource_balance(conn, alice)
        assert game.claim_daily_allowance(conn, alice) == {"paper": 10, "ink": 10}
        assert game.daily_allowance_claimed(conn, alice)
        with pytest.raises(game.GameError):
            game.claim_daily_allowance(conn, alice)
        assert game.resource_balance(conn, alice)["paper"] == before["paper"] + 10
    available = [oid for oid in game.ROTATING_NPC_CARDS if game.npc_offer_available(oid, alice)]
    assert len(available) == 1


def test_saved_print_attributes_are_two_axis_cmyk(world):
    alice, _ = world
    card_id = new_card(alice, "defect-print-123")
    with db.transaction() as conn:
        card = game.copy_detail(conn, card_id)
        for field in ("centering_x", "centering_y", "shift_c", "shift_m", "shift_y", "shift_k"):
            assert -1 <= card[field] <= 1
        assert card["color_effect"] in {"none", "fade", "desaturated", "hue-shift"}
        before = {k: card[k] for k in ("centering_x", "centering_y", "shift_c", "shift_m", "shift_y", "shift_k", "color_effect")}
        assert before == {k: game.copy_detail(conn, card_id)[k] for k in before}


def test_generation_uses_theme_and_rules_but_excludes_finish(world, monkeypatch):
    alice, _ = world
    seen = []

    def text_provider(context):
        seen.append(context)
        return "Moonlit Printer", "A fresh impression."

    def image_provider(design_id, context, name):
        seen.append(context)
        assert name == "Moonlit Printer"
        return providers.demo_art(design_id, context["theme_id"], name)

    monkeypatch.setattr(providers, "generate_text", text_provider)
    monkeypatch.setattr(providers, "generate_art", image_provider)
    new_card(alice, "context-print-123")
    assert len(seen) == 2
    for context in seen:
        assert context["theme_name"]
        assert context["theme_description"]
        assert context["rules"][0]["description"]
        assert not any(key.startswith("finish") for key in context)


def test_collection_progress_counts_designs_once(world):
    alice, bob = world
    with db.connect() as conn:
        initial = game.collection_progress(conn, alice)
        assert initial["cards"]["collected"] == 3
        assert initial["cards"]["total"] == 8
        assert initial["foils"]["collected"] == 2
        assert initial["rules"]["collected"] == 2

    printed = new_card(alice, "progress-print-123")
    with db.transaction() as conn:
        game.reprint(conn, alice, printed)
        after = game.collection_progress(conn, alice)
        assert after["cards"] == {"collected": 4, "total": 9, "percent": 44}
        assert game.collection_progress(conn, bob)["cards"]["collected"] == 3
        conn.execute("INSERT OR IGNORE INTO learned VALUES(?,?)", (alice, "holo"))
        assert game.collection_progress(conn, alice)["foils"]["collected"] == 3


def test_starter_decks_are_pre_generated_and_unlock_their_parts(world, monkeypatch):
    def never_generate(*_args, **_kwargs):
        raise AssertionError("Starter registration must not generate content")

    monkeypatch.setattr(providers, "generate_text", never_generate)
    monkeypatch.setattr(providers, "generate_art", never_generate)
    with db.transaction() as conn:
        starlit = game.create_user(conn, "stargazer", "long-password-123", starter_deck_id="starlit")
        velvet = game.create_user(conn, "foxkeeper", "long-password-123", starter_deck_id="velvet")
        for user_id, featured_ids in ((world[0], {"starter-press-cat", "starter-press-cat-foil"}),
                                      (starlit, {"npc-starlit-map", "npc-starlit-map-foil"}),
                                      (velvet, {"npc-foil-fox", "npc-foil-fox-standard"})):
            cards = game.library(conn, user_id)
            assert len(cards) == 3
            assert {card["design_id"] for card in cards} == featured_ids | {"starter-paper-sprite"}
            assert sum(card["finish_id"] != "standard" for card in cards) == 1
            assert any(card["design_id"] == "starter-paper-sprite" for card in cards)
            assert all(card["art_path"].endswith(".png") for card in cards)
        for deck in game.starter_decks(conn):
            assert sum(card["copies"] for card in deck["cards"] if card["finish_id"] != "standard") == 1
        learned = {row[0] for row in conn.execute("SELECT part_id FROM learned WHERE user_id=?", (velvet,))}
        assert {"spell", "monster", "absurd", "shimmer", "sleeved", "echo"} <= learned
        assert conn.execute("SELECT starter_deck_id FROM users WHERE id=?", (starlit,)).fetchone()[0] == "starlit"
