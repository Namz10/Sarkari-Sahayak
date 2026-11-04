"""Robust JSON and output extraction from Sarvam LLM responses (chat/SKILL.md).

Handles:
- Stripping <think>...</think> reasoning blocks
- Markdown code blocks (```json ... ```)
- Fallback to reasoning_content when content is None (token budget exhausted)
- Trailing commas and loose formatting in model responses
"""
from __future__ import annotations

import json
import re
from typing import Any


def extract_content_or_reasoning(choice_message: Any) -> str:
    """Extract content from Sarvam chat completion choice message.

    Per chat/SKILL.md:
    When token budget is consumed by reasoning, finish_reason is "length"
    and message.content is None, but reasoning_content contains the thoughts/output.
    """
    content = getattr(choice_message, "content", None)
    if content and str(content).strip():
        return str(content).strip()

    reasoning = getattr(choice_message, "reasoning_content", None)
    if reasoning and str(reasoning).strip():
        return str(reasoning).strip()

    return ""


def clean_and_parse_json(text: str) -> dict:
    """Extract the first valid JSON object from LLM response text."""
    if not text:
        raise ValueError("Cannot parse JSON from empty text.")

    # 1. Strip think / reasoning tags
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE)

    # 2. Extract from markdown code fence if present
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Strip any leftover backticks
    cleaned = re.sub(r"```(?:json)?|```", "", cleaned, flags=re.IGNORECASE).strip()

    # 4. Sequential raw_decode scan
    decoder = json.JSONDecoder()
    for index, char in enumerate(cleaned):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(cleaned[index:])
            if isinstance(value, dict):
                return value
        except json.JSONDecodeError:
            continue

    # 5. Fallback: clean trailing commas and try balanced bracket extraction
    brace_match = re.search(r"(\{.*\})", cleaned, flags=re.DOTALL)
    if brace_match:
        candidate = brace_match.group(1)
        # remove trailing commas before } or ]
        candidate = re.sub(r",\s*([\]\}])", r"\1", candidate)
        try:
            res = json.loads(candidate)
            if isinstance(res, dict):
                return res
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Model response did not contain a valid JSON object: {text[:150]}...")

