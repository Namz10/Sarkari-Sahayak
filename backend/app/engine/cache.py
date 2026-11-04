"""Persistent disk & memory caching layer for Sarkari Sahayak (SPEC section 5.4).

Caches expensive upstream Sarvam API calls:
- STT (audio hash -> transcript + lang)
- Profile (transcript hash -> profile + notes)
- Vision Document AI (image hash -> OCR fields + doc type)
- LLM Narration (results+pocket hash -> script + card_text)
- Bulbul TTS (script+voice hash -> audio_b64)
- Translation (text+src+tgt hash -> translated_text)

Provides sub-millisecond responses for repeated requests, saves user credits,
and guarantees resilience during demos.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = ROOT / ".cache" / "sarvam_cache"

_lock = threading.Lock()
_memory_cache: dict[str, Any] = {}
_MAX_MEMORY_ITEMS = 1000

_stats = {
    "hits": 0,
    "misses": 0,
    "writes": 0,
}


def hash_key(*parts: Any) -> str:
    """Compute a deterministic SHA-256 hex digest from arguments."""
    h = hashlib.sha256()
    for part in parts:
        if isinstance(part, bytes):
            h.update(part)
        elif isinstance(part, str):
            h.update(part.encode("utf-8"))
        else:
            h.update(json.dumps(part, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    return h.hexdigest()


def get(namespace: str, key: str) -> Any | None:
    """Retrieve an item from memory or disk cache."""
    composite_key = f"{namespace}:{key}"
    with _lock:
        if composite_key in _memory_cache:
            _stats["hits"] += 1
            return _memory_cache[composite_key]

    # Try disk cache
    file_path = CACHE_DIR / namespace / f"{key}.json"
    if file_path.exists():
        try:
            content = file_path.read_text(encoding="utf-8")
            data = json.loads(content)
            with _lock:
                if len(_memory_cache) >= _MAX_MEMORY_ITEMS:
                    _memory_cache.pop(next(iter(_memory_cache)), None)
                _memory_cache[composite_key] = data
                _stats["hits"] += 1
            return data
        except Exception:  # noqa: BLE001
            pass

    with _lock:
        _stats["misses"] += 1
    return None


def set_val(namespace: str, key: str, value: Any) -> None:
    """Store an item in memory and disk cache."""
    composite_key = f"{namespace}:{key}"
    with _lock:
        if len(_memory_cache) >= _MAX_MEMORY_ITEMS:
            _memory_cache.pop(next(iter(_memory_cache)), None)
        _memory_cache[composite_key] = value
        _stats["writes"] += 1

    # Persist to disk asynchronously or safely
    try:
        ns_dir = CACHE_DIR / namespace
        ns_dir.mkdir(parents=True, exist_ok=True)
        file_path = ns_dir / f"{key}.json"
        temp_path = ns_dir / f"{key}.tmp"
        temp_path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        os.replace(temp_path, file_path)
    except Exception:  # noqa: BLE001
        pass


def get_stats() -> dict[str, int]:
    """Return cache hit/miss statistics."""
    with _lock:
        return dict(_stats, memory_items=len(_memory_cache))


def clear(clear_disk: bool = False) -> None:
    """Clear memory cache, and optionally purge on-disk cache files."""
    with _lock:
        _memory_cache.clear()
        _stats["hits"] = 0
        _stats["misses"] = 0
        _stats["writes"] = 0
    if clear_disk and CACHE_DIR.exists():
        import shutil
        shutil.rmtree(CACHE_DIR, ignore_errors=True)
