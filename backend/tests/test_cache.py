import pytest

from app.engine.cache import clear, get, get_stats, hash_key, set_val


@pytest.fixture(autouse=True)
def _reset_cache():
    clear()
    yield
    clear()


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


def test_cache_is_process_local_and_does_not_write_files(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    set_val("privacy", "profile-key", {"name": "Ramesh", "transcript": "private"})
    assert get("privacy", "profile-key")["name"] == "Ramesh"
    assert list(tmp_path.iterdir()) == []


def test_cache_evicts_least_recently_used_entries(monkeypatch):
    import app.engine.cache as cache

    monkeypatch.setattr(cache, "_MAX_MEMORY_ITEMS", 2)
    first, second, third = (hash_key(label) for label in ("first", "second", "third"))
    set_val("lru", first, {"id": 1})
    set_val("lru", second, {"id": 2})
    assert get("lru", first) == {"id": 1}
    set_val("lru", third, {"id": 3})
    assert get("lru", second) is None
    assert get("lru", first) == {"id": 1}
