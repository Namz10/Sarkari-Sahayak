"""Sliding-window in-memory rate limiter (SPEC section 5.4).

Guards upstream spend and prevents spam:
- Default: 30 requests per minute per IP address.
- Bypassable via optional DEMO_PASSCODE header.
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict

_lock = threading.Lock()
_ip_timestamps: dict[str, list[float]] = defaultdict(list)

MAX_REQUESTS_PER_MINUTE = int(os.environ.get("RATE_LIMIT_RPM", "30"))
DEMO_PASSCODE = os.environ.get("DEMO_PASSCODE", "").strip()


def check_rate_limit(client_ip: str, passcode: str | None = None) -> tuple[bool, int]:
    """Check if client IP is within rate limits.

    Returns:
        (is_allowed, retry_after_seconds)
    """
    if DEMO_PASSCODE and passcode == DEMO_PASSCODE:
        return True, 0

    now = time.monotonic()
    window_start = now - 60.0

    with _lock:
        timestamps = _ip_timestamps[client_ip]
        # Prune old timestamps
        while timestamps and timestamps[0] < window_start:
            timestamps.pop(0)

        if len(timestamps) >= MAX_REQUESTS_PER_MINUTE:
            oldest = timestamps[0]
            retry_after = max(1, int(60.0 - (now - oldest)))
            return False, retry_after

        timestamps.append(now)
        return True, 0


def reset_rate_limits() -> None:
    """Clear all tracked IP timestamps."""
    with _lock:
        _ip_timestamps.clear()

