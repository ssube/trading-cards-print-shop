import base64

from server import providers


def test_openrouter_text_and_image_requests(monkeypatch, tmp_path):
    monkeypatch.setenv("TEXT_PROVIDER", "openrouter")
    monkeypatch.setenv("IMAGE_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("TEXT_MODEL", "openai/gpt-4.1-mini")
    monkeypatch.setenv("IMAGE_MODEL", "openai/gpt-image-1")
    monkeypatch.setattr(providers, "ASSETS", tmp_path)
    calls = []
    png = b"\x89PNG\r\n\x1a\n" + b"test image"

    def fake_post(url, headers, payload, timeout=120):
        calls.append((url, headers, payload))
        if url.endswith("/chat/completions"):
            return {"choices": [{"message": {"content": '{"name":"Moonlit Fox","flavor":"A quiet wonder."}'}}]}
        return {"data": [{"b64_json": base64.b64encode(png).decode()}]}

    monkeypatch.setattr(providers, "_post", fake_post)
    recipe = {"type_id": "monster", "theme_id": "storybook", "rules": [], "hint": "a fox"}
    name, flavor = providers.generate_text(recipe)
    art = providers.generate_art("test-card", recipe, name)

    assert (name, flavor) == ("Moonlit Fox", "A quiet wonder.")
    assert art == "/assets/test-card.png"
    assert (tmp_path / "test-card.png").read_bytes() == png
    assert calls[0][0] == "https://openrouter.ai/api/v1/chat/completions"
    assert calls[0][1]["Authorization"] == "Bearer test-key"
    assert calls[0][2]["model"] == "openai/gpt-4.1-mini"
    assert calls[1][0] == "https://openrouter.ai/api/v1/images"
    assert calls[1][2]["model"] == "openai/gpt-image-1"
    assert calls[1][2]["aspect_ratio"] == "2:3"


def test_hint_driven_styles_reach_both_provider_prompts(monkeypatch, tmp_path):
    monkeypatch.setenv("TEXT_PROVIDER", "openrouter")
    monkeypatch.setenv("IMAGE_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setattr(providers, "ASSETS", tmp_path)
    prompts = []
    png = b"\x89PNG\r\n\x1a\n" + b"test image"

    def fake_post(url, headers, payload, timeout=120):
        prompts.append(payload.get("prompt") or payload["messages"][0]["content"])
        if url.endswith("/chat/completions"):
            return {"choices": [{"message": {"content": '{"name":"The Red Umbrella","flavor":"Exactly as asked."}'}}]}
        return {"data": [{"b64_json": base64.b64encode(png).decode()}]}

    monkeypatch.setattr(providers, "_post", fake_post)
    for theme, expected in (("literal", "faithfully"), ("wishmaster", "surprising")):
        recipe = {"type_id": "spell", "theme_id": theme, "rules": [], "hint": "a red umbrella"}
        name, _ = providers.generate_text(recipe)
        providers.generate_art(f"test-{theme}", recipe, name)
        assert all("a red umbrella" in prompt for prompt in prompts[-2:])
        assert all(expected in prompt for prompt in prompts[-2:])
