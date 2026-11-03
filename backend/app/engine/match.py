"""Match a Profile against the scheme database."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.engine.derive import derive
from app.engine.rules import FAIL, PASS, UNKNOWN, evaluate_rule
from app.models import (
    MatchResponse, Pocket, Profile, Result, ResultScheme, RuleOutcome, Scheme,
)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "schemes.json"

STATE_NAMES = {
    "MP": "Madhya Pradesh", "MH": "Maharashtra", "OD": "Odisha",
    "UP": "Uttar Pradesh", "RJ": "Rajasthan", "BR": "Bihar", "GJ": "Gujarat",
}
STATUS_RANK = {"eligible": 0, "almost": 1, "confirm": 2, "not_eligible": 3}
STATUS_BASE = {"eligible": 3000, "almost": 2000, "confirm": 1000, "not_eligible": 0}


@lru_cache(maxsize=1)
def _load_raw() -> dict:
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _load_schemes_tuple() -> tuple[Scheme, ...]:
    return tuple(Scheme.model_validate(s) for s in _load_raw()["schemes"])


def load_schemes() -> list[Scheme]:
    return list(_load_schemes_tuple())


def _state_label(states: list[str]) -> str:
    return "Available only in " + " / ".join(STATE_NAMES.get(s, s) for s in states)


def evaluate_scheme(scheme: Scheme, fields: dict, docs: set[str]) -> Result:
    outcomes: list[RuleOutcome] = []
    hard: list[tuple[str, str]] = []  # (outcome, label)

    if scheme.states:
        st = fields.get("state")
        label = _state_label(scheme.states)
        o = UNKNOWN if st is None else (PASS if st in scheme.states else FAIL)
        outcomes.append(RuleOutcome(id="state", outcome=o, label_en=label))
        hard.append((o, label))

    for r in scheme.rules:
        o = evaluate_rule(r, fields)
        outcomes.append(RuleOutcome(id=r.id, outcome=o, label_en=r.label_en))
        if r.hard:
            hard.append((o, r.label_en))

    missing = [d for d in scheme.required_docs if d not in docs]
    failed = [lbl for o, lbl in hard if o == FAIL]
    unknown = [lbl for o, lbl in hard if o == UNKNOWN]
    if failed:
        status = "not_eligible"
    elif unknown:
        status = "confirm"
    elif missing:
        status = "almost"
    else:
        status = "eligible"

    amount = scheme.benefit.amount_inr
    score = STATUS_BASE[status] + min(amount // 1000, 900) - 10 * len(missing)
    return Result(
        scheme=ResultScheme(
            id=scheme.id, name=scheme.name, level=scheme.level,
            category=scheme.category, summary_en=scheme.summary_en,
            benefit=scheme.benefit, required_docs=scheme.required_docs,
            how_to_apply_en=scheme.how_to_apply_en, apply_url=scheme.apply_url,
            source_url=scheme.source_url,
        ),
        status=status, rules=outcomes, missing_docs=missing,
        unknown_labels=unknown, failed_labels=failed, score=max(score, 0),
    )


def match_all(profile: Profile, docs_held: list[str] | None = None) -> MatchResponse:
    docs = set(profile.docs_held) | set(docs_held or [])
    fields = derive(profile)
    results = [evaluate_scheme(s, fields, docs) for s in load_schemes()]
    results.sort(key=lambda r: (
        STATUS_RANK[r.status], -r.scheme.benefit.amount_inr, len(r.missing_docs),
    ))

    pocket = Pocket()
    for r in results:
        if r.status not in ("eligible", "almost"):
            continue
        b = r.scheme.benefit
        if not b.counts_in_pocket or b.kind == "access":
            continue
        bucket = getattr(pocket, r.status)
        setattr(bucket, b.kind, getattr(bucket, b.kind) + b.amount_inr)

    raw = _load_raw()
    return MatchResponse(
        results=results, pocket=pocket,
        schemes_version=str(raw.get("version", "")),
        verified_on=str(raw.get("verified_on", "")),
    )


def compact_results(resp: MatchResponse) -> list[dict]:
    return [
        {
            "id": r.scheme.id,
            "name_en": r.scheme.name.en,
            "status": r.status,
            "benefit": r.scheme.benefit.label_en,
            "amount_inr": r.scheme.benefit.amount_inr,
            "missing_docs": r.missing_docs,
            "unknown_labels": r.unknown_labels,
        }
        for r in resp.results
    ]
