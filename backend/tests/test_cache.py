import pytest

from app.engine.cache import clear, get, get_stats, hash_key, set_val


@pytest.fixture(autouse=True)
def _reset_cache():
    clear(clear_disk=True)
    yield
    clear(clear_disk=True)


def test_hash_key_is_deterministic():
    h1 = hash_key("stt", b"audio_bytes", "hi-IN")
    h2 = hash_key("stt", b"audio_bytes", "hi-IN")
    h3 = hash_key("stt", b"different_bytes", "hi-IN")
    assert h1 == h2
    assert h1 != h3


def test_cache_set_and_get_roundtrip():
    data = {"transcript": "नमस्ते मैं रमेश हूँ", "language_code": "hi-IN"}
    key = hash_key("test", "data")
    assert get("test_ns", key) is None

    set_val("test_ns", key, data)
    cached = get("test_ns", key)
    assert cached == data


def test_cache_stats_tracking():
    key = hash_key("stats_test")
    get("stats_ns", key)  # miss
    set_val("stats_ns", key, {"val": 123})
    get("stats_ns", key)  # hit

    stats = get_stats()
    assert stats["misses"] >= 1
    assert stats["hits"] >= 1
    assert stats["writes"] >= 1
