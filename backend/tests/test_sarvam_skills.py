from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

from app.engine.llm_parser import clean_and_parse_json, extract_content_or_reasoning
from app.engine.rate_limiter import check_rate_limit, reset_rate_limits
from app.engine.sanitizer import mask_pii
from app.main import STT_KEYTERMS, TTS_V4_SPEAKERS, app


def test_pii_sanitizer_masks_aadhaar():
    text = "Resident Aadhaar is 1234 5678 9012 and verified."
    masked = mask_pii(text)
    assert "1234 5678" not in masked
    assert "XXXX XXXX 9012" in masked


def test_pii_sanitizer_masks_pan_and_bank_account():
    text = "PAN: ABCDE1234F, Bank Account: 12345678901234, Mobile: 9876543210"
    masked = mask_pii(text)
    assert "ABCDE1234F" not in masked
    assert "XXXXX1234F" in masked
    assert "12345678901234" not in masked
    assert "XXXX" in masked
    assert "9876543210" not in masked


def test_llm_parser_strips_think_tags_and_markdown():
    raw = """<think>
    Thinking about the person's profile...
    Age is 34, occupation is driver.
    </think>
    ```json
    {
        "age": 34,
        "occupation": "gig_driver",
    }
    ```"""
    parsed = clean_and_parse_json(raw)
    assert parsed["age"] == 34
    assert parsed["occupation"] == "gig_driver"


def test_extract_content_or_reasoning_fallback():
    # Normal case: content is present
    msg1 = MagicMock(content='{"ok": true}', reasoning_content=None)
    assert extract_content_or_reasoning(msg1) == '{"ok": true}'

    # Gotcha case from chat/SKILL.md: content is None because tokens were spent on reasoning
    msg2 = MagicMock(content=None, reasoning_content='{"fallback": 42}')
    assert extract_content_or_reasoning(msg2) == '{"fallback": 42}'


def test_tts_v4_speakers_roster_matches_supported_languages():
    required_langs = ["hi-IN", "mr-IN", "ta-IN", "te-IN", "bn-IN", "gu-IN", "kn-IN", "pa-IN", "en-IN"]
    for lang in required_langs:
        assert lang in TTS_V4_SPEAKERS
        speaker = TTS_V4_SPEAKERS[lang]
        # v4 persona naming convention: voice_language_style
        parts = speaker.split("_")
        assert len(parts) >= 3


def test_stt_keyterms_contain_essential_schemes():
    assert "Aadhaar" in STT_KEYTERMS
    assert "Ayushman Bharat" in STT_KEYTERMS
    assert "e-Shram" in STT_KEYTERMS
    assert len(STT_KEYTERMS) <= 50  # Saaras v4 limit per speech-to-text/SKILL.md


def test_rate_limiter_sliding_window():
    reset_rate_limits()
    ip = "192.168.1.100"
    for _ in range(30):
        allowed, _ = check_rate_limit(ip)
        assert allowed is True

    # 31st request should be rate limited
    allowed, retry_after = check_rate_limit(ip)
    assert allowed is False
    assert retry_after > 0


def test_health_endpoint_includes_cache_stats():
    client = TestClient(app)
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "cache" in data
    assert "hits" in data["cache"]

