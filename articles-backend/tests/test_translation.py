from __future__ import annotations

import copy
import asyncio
import json

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import translation
from app.config import get_settings


def translation_payload() -> dict[str, object]:
    return {
        "title": "简体文章 Rust",
        "summary": "测试摘要。",
        "contentJson": {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "这是简体中文，Rust 保持不变。",
                            "marks": [{"type": "bold"}],
                        },
                        {
                            "type": "text",
                            "text": "代码不转换",
                            "marks": [{"type": "code"}],
                        },
                    ],
                },
                {
                    "type": "codeBlock",
                    "attrs": {"language": "python"},
                    "content": [{"type": "text", "text": "print('简体代码')"}],
                },
                {
                    "type": "figureImage",
                    "attrs": {
                        "src": "https://media.example.test/media/2026/07/"
                        + "a" * 64
                        + ".webp",
                        "alt": "简体图片说明",
                        "caption": "简体图片标题",
                        "align": "end",
                        "width": 50,
                    },
                },
            ],
        },
    }


def convert_for_test(value: str) -> str:
    replacements = {
        "简": "簡",
        "体": "體",
        "这": "這",
        "测": "測",
        "试": "試",
        "标": "標",
        "题": "題",
        "图": "圖",
        "说": "說",
        "转": "轉",
        "换": "換",
        "码": "碼",
        "变": "變",
    }
    return "".join(replacements.get(char, char) for char in value)


def test_translation_requires_admin(client: TestClient) -> None:
    payload = translation_payload()
    assert client.post("/api/articles/v1/admin/translate/traditional", json=payload).status_code == 401


def test_translation_requires_csrf(admin_client: TestClient) -> None:
    payload = translation_payload()
    admin_client.headers.pop("X-CSRF-Token", None)
    assert admin_client.post("/api/articles/v1/admin/translate/traditional", json=payload).status_code == 403


def test_missing_deepseek_key_returns_clear_503(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    response = admin_client.post("/api/articles/v1/admin/translate/traditional", json=translation_payload())
    assert response.status_code == 503
    assert response.json()["detail"] == "DeepSeek translation is not configured"


def test_translation_preserves_tiptap_structure_marks_media_and_code(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "deepseek_api_key", "test-only-key")
    payload = translation_payload()
    original_document = copy.deepcopy(payload["contentJson"])

    async def fake_request_batch(
        units: list[translation.TranslationUnit],
        _settings: object,
    ) -> dict[str, str]:
        return {unit.identifier: convert_for_test(unit.text) for unit in units}

    monkeypatch.setattr(translation, "_request_batch", fake_request_batch)
    response = admin_client.post("/api/articles/v1/admin/translate/traditional", json=payload)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["title"] == "簡體文章 Rust"
    assert result["summary"] == "測試摘要。"

    translated_doc = result["contentJson"]
    paragraph = translated_doc["content"][0]
    assert paragraph["content"][0]["text"] == "這是簡體中文，Rust 保持不變。"
    assert paragraph["content"][0]["marks"] == [{"type": "bold"}]
    assert paragraph["content"][1] == original_document["content"][0]["content"][1]
    assert translated_doc["content"][1] == original_document["content"][1]
    translated_image = translated_doc["content"][2]
    original_image = original_document["content"][2]
    assert translated_image["type"] == original_image["type"] == "figureImage"
    assert translated_image["attrs"]["alt"] == "簡體圖片說明"
    assert translated_image["attrs"]["caption"] == "簡體圖片標題"
    for media_attribute in ("src", "align", "width"):
        assert translated_image["attrs"][media_attribute] == original_image["attrs"][media_attribute]


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        ({"segments": []}, "incomplete translation mapping"),
        (
            {"segments": [{"id": "wrong", "text": "繁體 Rust。"}]},
            "changed translation segment",
        ),
        (
            {"segments": [{"id": "body-00000:0000", "text": "繁體 RUST。"}]},
            "changed non-Chinese text",
        ),
    ],
)
def test_mapping_validation_is_strict(payload: object, detail: str) -> None:
    expected = [translation.TranslationUnit("body-00000:0000", "简体 Rust。")]
    with pytest.raises(HTTPException, match=detail) as exc_info:
        translation._validate_mapping(payload, expected)
    assert exc_info.value.status_code == 502


@pytest.mark.parametrize("translated", ["繁體中", "繁體中文文"])
def test_mapping_rejects_changed_han_character_count(translated: str) -> None:
    expected = [translation.TranslationUnit("body-00000:0000", "简体中文")]
    payload = {"segments": [{"id": "body-00000:0000", "text": translated}]}
    with pytest.raises(HTTPException, match="changed Han-character count") as exc_info:
        translation._validate_mapping(payload, expected)
    assert exc_info.value.status_code == 502


def test_batches_include_serialized_json_overhead(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "deepseek_batch_chars", 1_000)
    monkeypatch.setattr(settings, "deepseek_max_tokens", 8_192)
    units = [
        translation.TranslationUnit("body-00000:0000", "简" * 460),
        translation.TranslationUnit("body-00001:0000", "体" * 460),
    ]

    assert sum(len(unit.text) for unit in units) < settings.deepseek_batch_chars
    assert len(translation._serialise_segments(units)) > settings.deepseek_batch_chars
    batches = translation._batches(units, settings)

    assert batches == [[units[0]], [units[1]]]
    assert all(len(translation._serialise_segments(batch)) <= settings.deepseek_batch_chars for batch in batches)


def test_batches_reserve_completion_token_headroom(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "deepseek_batch_chars", 10_000)
    monkeypatch.setattr(settings, "deepseek_max_tokens", 512)
    units = [
        translation.TranslationUnit("body-00000:0000", "简" * 80),
        translation.TranslationUnit("body-00001:0000", "体" * 80),
    ]

    assert translation._estimated_completion_tokens(units) > translation._completion_token_budget(settings)
    batches = translation._batches(units, settings)

    assert batches == [[units[0]], [units[1]]]
    assert all(
        translation._estimated_completion_tokens(batch) <= translation._completion_token_budget(settings)
        for batch in batches
    )


@pytest.mark.parametrize(
    "completion",
    [
        {"choices": [{"finish_reason": "length", "message": {"content": '{"segments":[]}'}}]},
        {"choices": [{"finish_reason": "stop", "message": {"content": ""}}]},
    ],
)
def test_incomplete_or_empty_completion_is_rejected(completion: object) -> None:
    expected = [translation.TranslationUnit("title:0000", "简体")]
    with pytest.raises(HTTPException) as exc_info:
        translation._decode_completion(json.dumps(completion).encode(), expected)
    assert exc_info.value.status_code == 502


def test_deepseek_request_uses_current_model_json_mode_and_server_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "deepseek_api_key", "server-only-test-key")
    monkeypatch.setattr(settings, "deepseek_model", "deepseek-v4-flash")
    real_async_client = httpx.AsyncClient

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.deepseek.com/chat/completions"
        assert request.headers["authorization"] == "Bearer server-only-test-key"
        body = json.loads(request.content)
        assert body["model"] == "deepseek-v4-flash"
        assert body["response_format"] == {"type": "json_object"}
        assert body["thinking"] == {"type": "disabled"}
        assert "JSON object" in body["messages"][0]["content"]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "finish_reason": "stop",
                        "message": {
                            "content": json.dumps(
                                {"segments": [{"id": "title:0000", "text": "繁體"}]},
                                ensure_ascii=False,
                            )
                        },
                    }
                ]
            },
        )

    def client_factory(**kwargs: object) -> httpx.AsyncClient:
        kwargs.pop("trust_env", None)
        kwargs.pop("follow_redirects", None)
        return real_async_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(translation.httpx, "AsyncClient", client_factory)
    result = asyncio.run(
        translation._request_batch(
            [translation.TranslationUnit("title:0000", "繁体")],
            settings,
        )
    )
    assert result == {"title:0000": "繁體"}
