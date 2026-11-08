"""Bounded, process-local cache for expensive Sarvam API calls.

Caches expensive upstream Sarvam API calls:
- STT (audio hash -> transcript + lang)
- Profile (transcript hash -> profile + notes)
- Vision Document AI (image hash -> OCR fields + doc type)
- LLM Narration (results+pocket hash -> script + card_text)
- Bulbul TTS (script+voice hash -> audio_b64)
- Translation (text+src+tgt hash -> translated_text)

Avoids writing transcripts, profile fields, document extraction, or generated
audio to disk. Cache entries expire with the process and have a strict memory
budget so repeated requests cannot grow the serverless function without bound.
"""
from __future__ import annotations

from collections import OrderedDict
import hashlib
import json
import threading
from typing import Any

_lock = threading.Lock()
_memory_cache: OrderedDict[str, tuple[Any, int]] = OrderedDict()
_memory_cache_bytes = 0
_MAX_MEMORY_ITEMS = 256
_MAX_MEMORY_BYTES = 48 * 1024 * 1024

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
    """Retrieve a process-local cached value and refresh its LRU position."""
    composite_key = f"{namespace}:{key}"
    with _lock:
        if composite_key in _memory_cache:
            _stats["hits"] += 1
            entry = _memory_cache.pop(composite_key)
            _memory_cache[composite_key] = entry
            return entry[0]

    with _lock:
        _stats["misses"] += 1
    return None


def set_val(namespace: str, key: str, value: Any) -> None:
    """Store JSON-compatible values while respecting strict item and byte caps."""
    global _memory_cache_bytes
    composite_key = f"{namespace}:{key}"
    try:
        value_bytes = len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    except (TypeError, ValueError):
        return
    if value_bytes > _MAX_MEMORY_BYTES:
        return
    with _lock:
        old_value = _memory_cache.pop(composite_key, None)
        if old_value:
            _memory_cache_bytes -= old_value[1]
        while _memory_cache and (
            len(_memory_cache) >= _MAX_MEMORY_ITEMS
            or _memory_cache_bytes + value_bytes > _MAX_MEMORY_BYTES
        ):
            _, (_, evicted_bytes) = _memory_cache.popitem(last=False)
            _memory_cache_bytes -= evicted_bytes
        _memory_cache[composite_key] = (value, value_bytes)
        _memory_cache_bytes += value_bytes
        _stats["writes"] += 1


def get_stats() -> dict[str, int]:
    """Return cache hit/miss statistics."""
    with _lock:
        return dict(_stats, memory_items=len(_memory_cache))


def clear() -> None:
    """Clear all process-local cache entries and counters."""
    global _memory_cache_bytes
    with _lock:
        _memory_cache.clear()
        _memory_cache_bytes = 0
        _stats["hits"] = 0
        _stats["misses"] = 0
        _stats["writes"] = 0
