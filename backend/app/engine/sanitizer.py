"""PII Sanitization & Redaction for Sarkari Sahayak (SPEC section 1.4 & 5.4).

Ensures zero PII leakage:
- Aadhaar (12 digits) -> XXXX XXXX 1234
- PAN (5 letters + 4 digits + 1 letter) -> XXXXX1234X
- Bank Account numbers (9 to 18 digits) -> XXXX...1234
- Indian Phone Numbers (10 digits starting with 6-9) -> XXXXX XXX89
- Voter ID (3 letters + 7 digits) -> XXXX...123
"""
from __future__ import annotations

import re


def mask_pii(text: str) -> str:
    """Mask sensitive government and personal identifiers in OCR or transcript text."""
    if not text:
        return ""

    # 1. Aadhaar: 12 digits, optional spaces or dashes
    text = re.sub(
        r"\b(\d{4})[ -]?(\d{4})[ -]?(\d{4})\b",
        r"XXXX XXXX \3",
        text,
    )

    # 2. PAN Card: [A-Z]{5}[0-9]{4}[A-Z]
    text = re.sub(
        r"\b([A-Z]{5})(\d{4})([A-Z])\b",
        r"XXXXX\2\3",
        text,
        flags=re.IGNORECASE,
    )

    # 3. Voter ID / EPIC: [A-Z]{3}[0-9]{7}
    text = re.sub(
        r"\b([A-Z]{3})(\d{4})(\d{3})\b",
        r"XXX XXXX \3",
        text,
        flags=re.IGNORECASE,
    )

    # 4. Indian Mobile: 10 digits starting with 6,7,8,9
    text = re.sub(
        r"\b([6-9]\d{4})[ -]?(\d{3})(\d{2})\b",
        r"XXXXX XXX\3",
        text,
    )

    # 5. Bank Account Numbers: 9 to 18 digits
    def _mask_account(match: re.Match) -> str:
        s = match.group(0)
        # Avoid masking 4-digit years or already masked sequences
        if len(s) < 9:
            return s
        return "X" * (len(s) - 4) + s[-4:]

    text = re.sub(r"\b\d{9,18}\b", _mask_account, text)

    return text

