import json
from collections import Counter

import pytest

from server import cli, db, decks, game, providers


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


def test_admin_cli_add_card_and_themed_set(world, tmp_path, capsys):
    alice, bob = world
    with db.transaction() as conn:
        conn.execute("UPDATE users SET is_admin=1 WHERE id=?", (alice,))
    cli.main(["add-card", "--actor", "alice", "--to", "bob", "--reason", "playtest",
              "--name", "Copper Minnow", "--theme-id", "maritime"])
    single = json.loads(capsys.readouterr().out)["cards"][0]
    with db.connect() as conn:
        assert game.copy_detail(conn, single["copy_id"], bob)["name"] == "Copper Minnow"
    manifest = tmp_path / "set.json"
    manifest.write_text(json.dumps({"title": "Harbor Wonders", "theme_id": "maritime", "cards": [
        {"name": "Pearlwater Pier", "type_id": "land"},
        {"name": "Tideglass Charm", "type_id": "spell", "rule_ids": ["arrival", "draw"]}]}))
    cli.main(["add-set", "--actor", "alice", "--reason", "catalog expansion", "--file", str(manifest)])
    results = json.loads(capsys.readouterr().out)
    assert results["set"] == "Harbor Wonders"
    assert len(results["cards"]) == 2
    assert all("copy_id" not in card for card in results["cards"])
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM designs WHERE id IN (?,?)", tuple(card["design_id"] for card in results["cards"])).fetchone()[0] == 2
        assert conn.execute("SELECT action FROM audit ORDER BY id DESC LIMIT 1").fetchone()[0] == "add-set"
    manifest.write_text(json.dumps({"title": "Broken Set", "theme_id": "maritime", "cards": [
        {"name": "Valid Card"}, {"name": "Invalid Card", "rule_ids": ["arrival", "missing"]}]}))
    with pytest.raises(SystemExit):
        cli.main(["add-set", "--actor", "alice", "--reason", "test", "--file", str(manifest)])
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) FROM designs WHERE name='Valid Card'").fetchone()[0] == 0


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


def test_daily_edition_reset_preserves_jobs_and_only_affects_one_player(world):
    alice, bob = world
    new_card(alice, "before-reset-alice")
    new_card(bob, "before-reset-bob")
    with db.transaction() as conn:
        assert game.generation_count(conn, alice) == 1
        assert game.generation_count(conn, bob) == 1
        conn.execute("INSERT INTO generation_resets(user_id,day,reset_at) VALUES(?,?,?)",
                     (alice, game.day(), game.stamp()))
        assert game.generation_count(conn, alice) == 0
        assert game.generation_count(conn, bob) == 1
    new_card(alice, "after-reset-alice")
    with db.connect() as conn:
        assert game.generation_count(conn, alice) == 1
        assert conn.execute("SELECT COUNT(*) FROM jobs WHERE user_id=? AND kind='design'", (alice,)).fetchone()[0] == 2


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
        conn.execute("DELETE FROM learned WHERE user_id=? AND part_id='storybook'", (bob,))
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
        assert {"absurd", "echo"} <= set(learned)
        claim = game.commission_claim(conn, alice, "first-edition", fox_copy)
        assert claim["paper"] == 3
        assert game.copy_detail(conn, fox_copy)["owner_id"] is None


def test_study_costs_ten_percent_and_rejects_fully_learned_card(world):
    alice, _ = world
    with db.transaction() as conn:
        copy_id = game.mint_copy(conn, "npc-foil-fox", alice)
        conn.execute("UPDATE copies SET condition=73 WHERE id=?", (copy_id,))
        game.adjust_resources(conn, alice, {"sleeve": 1})
        game.sleeve(conn, alice, copy_id)
        assert game.study(conn, alice, copy_id)
        assert game.copy_detail(conn, copy_id, alice)["condition"] == 65
        with pytest.raises(game.GameError, match="already learned everything"):
            game.study(conn, alice, copy_id)
        assert game.copy_detail(conn, copy_id, alice)["condition"] == 65


def test_daily_sleeve_bonus_distribution():
    assert Counter(game.daily_sleeve_bonus(roll) for roll in range(100)) == {0: 55, 1: 25, 2: 15, 3: 5}


def test_daily_allowance_is_unique(world, monkeypatch):
    alice, _ = world
    monkeypatch.setattr(game.secrets, "randbelow", lambda upper: 4)
    with db.transaction() as conn:
        before = game.resource_balance(conn, alice)
        assert game.claim_daily_allowance(conn, alice) == {"paper": 10, "ink": 10, "sleeve": 3}
        assert game.daily_allowance_claimed(conn, alice)
        with pytest.raises(game.GameError):
            game.claim_daily_allowance(conn, alice)
        assert game.resource_balance(conn, alice)["paper"] == before["paper"] + 10
        assert game.resource_balance(conn, alice)["sleeve"] == before["sleeve"] + 3
    available = [oid for oid in game.ROTATING_NPC_CARDS if game.npc_offer_available(oid, alice)]
    assert len(available) == 1


def test_print_defects_are_rare_and_centered():
    samples = [game.quality_attributes({"rule_ids": ["arrival", "draw"]}) for _ in range(2000)]
    centered = [sample for sample in samples if sample[1] or sample[2]]
    registered = [sample for sample in samples if any(sample[3:7])]
    colored = [sample for sample in samples if sample[7] != "none"]
    clean = [sample for sample in samples if not any(sample[1:7]) and sample[7] == "none" and sample[8] == sample[9] == 0]
    assert 0.10 < len(centered) / len(samples) < 0.27
    assert 0.08 < len(registered) / len(samples) < 0.25
    assert len(colored) / len(samples) < 0.09
    assert len(clean) / len(samples) > 0.45
    assert abs(sum(sample[1] for sample in samples) / len(samples)) < 0.02
    assert abs(sum(sample[2] for sample in samples) / len(samples)) < 0.02
    assert max(abs(value) for sample in samples for value in sample[1:3]) <= 0.45
    assert max(abs(value) for sample in samples for value in sample[3:7]) <= 0.28


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
        assert initial["cards"]["collected"] == 5
        assert initial["cards"]["total"] == 48
        assert initial["foils"]["collected"] == 2
        assert initial["borders"] == {"collected": 1, "total": 3, "percent": 33}
        assert initial["backs"] == {"collected": 1, "total": 3, "percent": 33}
        assert initial["rules"]["collected"] == 5

    printed = new_card(alice, "progress-print-123")
    with db.transaction() as conn:
        game.reprint(conn, alice, printed)
        after = game.collection_progress(conn, alice)
        assert after["cards"] == {"collected": 6, "total": 49, "percent": 12}
        assert game.collection_progress(conn, bob)["cards"]["collected"] == 5
        conn.execute("INSERT OR IGNORE INTO learned VALUES(?,?)", (alice, "holo"))
        assert game.collection_progress(conn, alice)["foils"]["collected"] == 3


def test_new_foil_finishes_can_be_collected_and_studied(world):
    alice, _ = world
    finishes = {"shimmer", "holo", "etched", "starfield", "glitter", "confetti", "aurora", "spooky", "pumpkin", "crashout"}
    with db.transaction() as conn:
        catalog = {part["id"]: part for part in game.catalogue(conn, alice) if part["kind"] == "finish"}
        assert set(catalog) == finishes | {"standard"}
        assert all(json.loads(catalog[finish]["cost_json"])["foil"] > 0 for finish in finishes)
        game.adjust_resources(conn, alice, {"foil": 2})
        reward = game.npc_trade(conn, alice, "glitter-lesson")
        assert game.copy_detail(conn, reward["copy_id"], alice)["finish_id"] == "glitter"
        assert "glitter" in game.study(conn, alice, reward["copy_id"])
        assert next(part for part in game.catalogue(conn, alice) if part["id"] == "glitter")["learned"] == 1


def test_regular_prints_use_less_ink_than_foil_editions(world):
    alice, _ = world
    with db.transaction() as conn:
        assert game.print_cost(conn, ["arrival", "draw"], "standard")["ink"] == 1
        assert game.print_cost(conn, ["arrival", "if_land", "draw"], "standard")["ink"] == 2
        assert game.print_cost(conn, ["arrival", "draw"], "pumpkin") == {"paper": 1, "ink": 3, "foil": 2}
        assert game.print_cost(conn, ["arrival", "draw"], "etched")["foil"] == 3
        assert game.print_cost(conn, ["arrival", "draw"], "aurora")["foil"] == 3
        assert game.print_cost(conn, ["arrival", "draw"], "crashout")["foil"] == 3
        assert game.print_cost(conn, ["arrival", "if_land", "draw"], "pumpkin")["ink"] == 4
        game.adjust_resources(conn, alice, {"paper": 2, "ink": 2})
        reward = game.npc_trade(conn, alice, "pumpkin-lesson")
        assert game.copy_detail(conn, reward["copy_id"], alice)["finish_id"] == "pumpkin"
        assert "pumpkin" in game.study(conn, alice, reward["copy_id"])
        game.adjust_resources(conn, alice, {"foil": 3, "ink": 2})
        reward = game.npc_trade(conn, alice, "crashout-lesson")
        assert game.copy_detail(conn, reward["copy_id"], alice)["finish_id"] == "crashout"
        assert "crashout" in game.study(conn, alice, reward["copy_id"])


def test_starter_decks_are_pre_generated_and_unlock_their_parts(world, monkeypatch):
    def never_generate(*_args, **_kwargs):
        raise AssertionError("Starter registration must not generate content")

    monkeypatch.setattr(providers, "generate_text", never_generate)
    monkeypatch.setattr(providers, "generate_art", never_generate)
    with db.transaction() as conn:
        starlit = game.create_user(conn, "stargazer", "long-password-123", starter_deck_id="starlit")
        velvet = game.create_user(conn, "foxkeeper", "long-password-123", starter_deck_id="velvet")
        for user_id, featured_ids, style in ((world[0], {"starter-press-cat", "starter-press-cat-foil"}, ("classic", "archive")),
                                             (starlit, {"npc-starlit-map", "npc-starlit-map-foil"}, ("starlit", "atlas")),
                                             (velvet, {"npc-foil-fox", "npc-foil-fox-standard"}, ("velvet", "mischief"))):
            cards = game.library(conn, user_id)
            assert len(cards) == 6
            assert featured_ids | {"starter-paper-sprite", "starter-recut"} <= {card["design_id"] for card in cards}
            assert sum(card["finish_id"] != "standard" for card in cards) == 1
            assert all((card["border_id"], card["back_id"]) == style for card in cards if card["design_id"] in featured_ids)
            assert any(card["design_id"] == "starter-paper-sprite" for card in cards)
            assert all(card["art_path"].endswith((".png", ".svg")) for card in cards)
        for deck in game.starter_decks(conn):
            assert sum(card["copies"] for card in deck["cards"] if card["finish_id"] != "standard") == 1
        learned = {row[0] for row in conn.execute("SELECT part_id FROM learned WHERE user_id=?", (velvet,))}
        assert {"spell", "monster", "absurd", "shimmer", "dusk", "echo", "velvet", "mischief"} <= learned
        assert conn.execute("SELECT starter_deck_id FROM users WHERE id=?", (starlit,)).fetchone()[0] == "starlit"


def test_border_and_back_are_learned_printed_and_reprinted(world):
    alice, _ = world
    recipe = {"type_id": "monster", "rule_ids": ["arrival", "draw"], "theme_id": "storybook",
              "finish_id": "standard", "border_id": "starlit", "back_id": "atlas"}
    with db.transaction() as conn:
        assert {"classic", "archive"} <= {row[0] for row in conn.execute(
            "SELECT part_id FROM learned WHERE user_id=?", (alice,))}
        with pytest.raises(game.GameError, match="not learned"):
            game.validate_recipe(conn, alice, recipe)
        map_copy = game.mint_copy(conn, "npc-starlit-map", alice)
        assert {"starlit", "atlas"} <= set(game.study(conn, alice, map_copy))
        assert game.collection_progress(conn, alice)["borders"]["collected"] == 2
        assert game.collection_progress(conn, alice)["backs"]["collected"] == 2
        assert game.validate_recipe(conn, alice, recipe)["border_id"] == "starlit"
        job = game.create_print_job(conn, alice, recipe, "styled-print-123")
    providers.process_job(job["id"])
    with db.transaction() as conn:
        printed = conn.execute("SELECT copy_id FROM jobs WHERE id=?", (job["id"],)).fetchone()[0]
        assert printed
        assert (game.copy_detail(conn, printed)["border_id"], game.copy_detail(conn, printed)["back_id"]) == ("starlit", "atlas")
        reprint = game.reprint(conn, alice, printed)
        assert (game.copy_detail(conn, reprint)["border_id"], game.copy_detail(conn, reprint)["back_id"]) == ("starlit", "atlas")


def test_back_foil_and_premium_materials_survive_reprint(world):
    alice, _ = world
    with db.transaction() as conn:
        assert game.print_cost(conn, ["arrival", "draw"], "standard", "starlit", "atlas") == {"paper": 1, "ink": 3, "foil": 0}
        assert game.print_cost(conn, ["arrival", "draw"], "standard", "velvet", "mischief", "shimmer") == {"paper": 1, "ink": 3, "foil": 1}
        assert game.print_cost(conn, ["arrival", "draw"], "shimmer", "classic", "archive", "shimmer") == {"paper": 1, "ink": 4, "foil": 2}
        fox = game.mint_copy(conn, "npc-foil-fox-standard", alice)
        assert game.copy_detail(conn, fox)["back_finish_id"] == "shimmer"
        game.study(conn, alice, fox)
        game.adjust_resources(conn, alice, {"foil": 5, "ink": 10})
        with pytest.raises(game.GameError, match="Back foil requires"):
            game.validate_recipe(conn, alice, {"type_id": "monster", "rule_ids": ["arrival", "draw"],
                                               "theme_id": "storybook", "finish_id": "standard",
                                               "back_id": "mischief", "foil_back": True})
        recipe = {"type_id": "monster", "rule_ids": ["arrival", "draw"], "theme_id": "storybook",
                  "finish_id": "shimmer", "border_id": "classic", "back_id": "archive", "foil_back": True}
        before = game.resource_balance(conn, alice)
        job = game.create_print_job(conn, alice, recipe, "back-foil-print-123")
        after = game.resource_balance(conn, alice)
        assert (before["paper"] - after["paper"], before["ink"] - after["ink"], before["foil"] - after["foil"]) == (1, 4, 2)
    providers.process_job(job["id"])
    with db.transaction() as conn:
        copy_id = conn.execute("SELECT copy_id FROM jobs WHERE id=?", (job["id"],)).fetchone()[0]
        assert game.copy_detail(conn, copy_id)["back_finish_id"] == "shimmer"
        reprint = game.reprint(conn, alice, copy_id)
        assert game.copy_detail(conn, reprint)["back_finish_id"] == "shimmer"


def test_seed_restores_starter_styles_for_existing_players(world):
    with db.transaction() as conn:
        starlit = game.create_user(conn, "oldstargazer", "long-password-123", starter_deck_id="starlit")
        conn.execute("DELETE FROM learned WHERE part_id IN ('classic','archive','starlit','atlas')")
    game.seed()
    with db.connect() as conn:
        alice_styles = {row[0] for row in conn.execute("SELECT part_id FROM learned WHERE user_id=?", (world[0],))}
        starlit_styles = {row[0] for row in conn.execute("SELECT part_id FROM learned WHERE user_id=?", (starlit,))}
        assert {"classic", "archive"} <= alice_styles
        assert {"classic", "archive", "starlit", "atlas"} <= starlit_styles


def test_new_premade_cards_have_bundled_art_and_teach_playable_rules(world):
    alice, _ = world
    expected = {
        "borrowed-dawn": ("npc-borrowed-dawn", "botanical", {"dawn", "if_land", "mend"}),
        "clockwork-heron": ("npc-clockwork-heron", "clockwork", {"on_draw", "if_monster", "glimpse"}),
        "tideglass-portal": ("npc-tideglass-portal", "maritime", {"arrival", "if_spell", "return"}),
    }
    with db.transaction() as conn:
        game.adjust_resources(conn, alice, {"paper": 10, "ink": 10, "foil": 3})
        for offer_id, (design_id, theme, rules) in expected.items():
            reward = game.npc_trade(conn, alice, offer_id)
            card = game.copy_detail(conn, reward["copy_id"], alice)
            assert card["design_id"] == design_id
            assert card["art_path"].endswith(f"{design_id}.png")
            assert set(card["rule_ids"]) == rules
            assert len(card["rule_names"]) == 3
            assert all("_" not in name for name in card["rule_names"])
            assert theme in game.study(conn, alice, card["id"])
            learned = {row[0] for row in conn.execute("SELECT part_id FROM learned WHERE user_id=?", (alice,))}
            assert rules <= learned
            assert game.validate_recipe(conn, alice, {
                "type_id": card["type_id"], "rule_ids": card["rule_ids"],
                "theme_id": theme, "finish_id": card["finish_id"],
                "border_id": card["border_id"], "back_id": card["back_id"]})


def test_new_art_styles_can_be_discovered_and_learned(world):
    alice, _ = world
    examples = {
        "cyber-lesson": ("npc-glasswire-courier", "cyber"),
        "grimdark-lesson": ("npc-ashen-bell", "grimdark"),
        "literal-lesson": ("npc-red-umbrella", "literal"),
        "wishmaster-lesson": ("npc-stopped-clock-forest", "wishmaster"),
    }
    with db.transaction() as conn:
        game.adjust_resources(conn, alice, {"paper": 20, "ink": 20})
        for offer_id, (design_id, theme) in examples.items():
            reward = game.npc_trade(conn, alice, offer_id)
            card = game.copy_detail(conn, reward["copy_id"], alice)
            assert card["design_id"] == design_id
            assert card["art_path"].endswith(f"{design_id}.svg")
            assert theme in game.study(conn, alice, card["id"])
            recipe = {
                "type_id": card["type_id"], "rule_ids": card["rule_ids"],
                "theme_id": theme, "finish_id": card["finish_id"],
                "border_id": card["border_id"], "back_id": card["back_id"]}
            if theme in {"literal", "wishmaster"}:
                with pytest.raises(game.GameError, match="needs a title or theme hint"):
                    game.validate_recipe(conn, alice, recipe)
                recipe["hint"] = "a red umbrella"
            game.validate_recipe(conn, alice, recipe)


def test_physical_print_charge_is_atomic_and_protection_applies(world):
    alice, bob = world
    with db.transaction() as conn:
        copy_id = conn.execute("SELECT id FROM copies WHERE owner_id=? LIMIT 1", (alice,)).fetchone()[0]
        original = game.copy_detail(conn, copy_id, alice)["condition"]
        paper = game.resource_balance(conn, alice)["paper"]
        items = [{"copy_id": copy_id, "quantity": 2}]
        assert game.charge_physical_print(conn, alice, items, "physical-print-123") == {"cards": 2, "sheets": 1}
        assert game.charge_physical_print(conn, alice, items, "physical-print-123") == {"cards": 2, "sheets": 1}
        assert game.copy_detail(conn, copy_id, alice)["condition"] == original - 2
        assert game.resource_balance(conn, alice)["paper"] == paper - 1
        with pytest.raises(game.GameError):
            game.charge_physical_print(conn, bob, items, "physical-print-bob")
        game.sleeve(conn, alice, copy_id)
        game.charge_physical_print(conn, alice, [{"copy_id": copy_id, "quantity": 9}], "physical-print-sleeved")
        assert game.copy_detail(conn, copy_id, alice)["condition"] == original - 2
        with pytest.raises(game.GameError):
            game.charge_physical_print(conn, alice, [{"copy_id": copy_id, "quantity": 91}], "physical-print-too-many")
        with pytest.raises(game.GameError):
            game.charge_physical_print(conn, alice, [{"copy_id": copy_id, "quantity": 1}], "physical-print-123")


def test_print_hint_reaches_generation_and_rejects_long_input(world):
    alice, _ = world
    recipe = {"type_id": "monster", "rule_ids": ["arrival", "draw"], "theme_id": "storybook",
              "finish_id": "standard", "hint": "A fox in a moonlit bookshop"}
    with db.transaction() as conn:
        before = game.resource_balance(conn, alice)
        with pytest.raises(game.GameError, match="Hint must be"):
            game.create_print_job(conn, alice, {**recipe, "hint": "x" * 255}, "hint-too-long")
        assert game.resource_balance(conn, alice) == before
        job = game.create_print_job(conn, alice, recipe, "hint-valid-123")
        assert json.loads(job["payload"])["recipe"]["hint"] == recipe["hint"]
    providers.process_job(job["id"])
    with db.connect() as conn:
        copy_id = conn.execute("SELECT copy_id FROM jobs WHERE id=?", (job["id"],)).fetchone()[0]
        assert game.copy_detail(conn, copy_id, alice)["name"] == recipe["hint"]


def test_curated_deck_claim_is_once_and_preserves_cards(world):
    alice, bob = world
    with db.transaction() as conn:
        before = decks.list_decks(conn, alice)
        pressroom = next(deck for deck in before if deck["id"] == "pressroom")
        assert pressroom["filled"] == 3 and not pressroom["claimed"]
        assert pressroom["analysis"]["type_counts"] == {"monster": 2, "spell": 1}
        original_ids = {slot["card"]["id"] for slot in pressroom["slots"]}
        reward = decks.claim_reward(conn, alice, "pressroom")
        assert reward["resources"] == {"sleeve": 1}
        copy = game.copy_detail(conn, reward["copy_id"], alice)
        assert copy["design_id"] == "reward-press-cat-holo"
        assert copy["finish_id"] == "holo"
        assert original_ids <= {card["id"] for card in game.library(conn, alice)}
        assert decks.list_decks(conn, alice)[0]["claimed"]
        with pytest.raises(game.GameError) as duplicate:
            decks.claim_reward(conn, alice, "pressroom")
        assert duplicate.value.status == 409
        with pytest.raises(game.GameError):
            decks.claim_reward(conn, bob, "starlit")


def test_custom_decks_match_theme_and_respect_ownership(world):
    alice, bob = world
    with db.transaction() as conn:
        custom_id = decks.create_custom(conn, alice, "  Paper friends  ", "storybook")
        created = next(deck for deck in decks.list_decks(conn, alice) if deck["id"] == custom_id)
        assert created["title"] == "Paper friends" and created["filled"] == 3
        assert created["reward"] is None
        assert [slot["type_id"] for slot in created["slots"]] == ["land", "monster", "spell"]
        assert custom_id not in {deck["id"] for deck in decks.list_decks(conn, bob)}
        land_id = game.mint_copy(conn, "npc-borrowed-dawn", alice, quality_override=88)
        assert next(deck for deck in decks.list_decks(conn, alice) if deck["id"] == custom_id)["filled"] == 3
        design = conn.execute("SELECT * FROM designs WHERE id='npc-borrowed-dawn'").fetchone()
        conn.execute("UPDATE designs SET theme_id='storybook' WHERE id=?", (design["id"],))
        assert next(deck for deck in decks.list_decks(conn, alice) if deck["id"] == custom_id)["filled"] == 3
        conn.execute("UPDATE copies SET owner_id=? WHERE id=?", (bob, land_id))
        assert next(deck for deck in decks.list_decks(conn, alice) if deck["id"] == custom_id)["filled"] == 3
        decks.update_custom(conn, alice, custom_id, "New title", "celestial")
        assert next(deck for deck in decks.list_decks(conn, alice) if deck["id"] == custom_id)["title"] == "New title"
        with pytest.raises(game.GameError):
            decks.update_custom(conn, bob, custom_id, "Stolen", "celestial")
        decks.delete_custom(conn, alice, custom_id)
        assert custom_id not in {deck["id"] for deck in decks.list_decks(conn, alice)}


def test_slabbed_deck_reward(world):
    alice, _ = world
    with db.transaction() as conn:
        for design_id in ("npc-foil-fox", "npc-foil-fox-standard"):
            game.mint_copy(conn, design_id, alice, quality_override=88)
        reward = decks.claim_reward(conn, alice, "velvet")
        copy = game.copy_detail(conn, reward["copy_id"], alice)
        assert copy["slab_grade"] == 8 and copy["grade"] == 8
        assert copy["design_id"] == "reward-foil-fox-holo"
