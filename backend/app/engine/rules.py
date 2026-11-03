"""Three-valued rule evaluation."""
from __future__ import annotations

from typing import Any

from app.models import Rule

PASS, FAIL, UNKNOWN = "pass", "fail", "unknown"


def _b(x: bool) -> str:
    return PASS if x else FAIL


def evaluate_rule(rule: Rule, fields: dict[str, Any]) -> str:
    v = fields.get(rule.field)
    op, ref = rule.op, rule.value
    if op == "exists":
        return _b(v is not None)
    if v is None:
        return UNKNOWN
    if op == "eq":
        return _b(v == ref)
    if op == "neq":
        return _b(v != ref)
    if op == "in":
        return _b(v in ref)
    if op == "not_in":
        return _b(v not in ref)
    if op == "gte":
        return _b(v >= ref)
    if op == "lte":
        return _b(v <= ref)
    if op == "between":
        return _b(ref[0] <= v <= ref[1])
    if op == "is_true":
        return _b(v is True)
    if op == "is_false":
        return _b(v is False)
    raise ValueError(f"unknown op {op}")
