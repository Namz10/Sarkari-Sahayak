"""Derived fields computed from a Profile. None means unknown."""
from __future__ import annotations

from typing import Any

from app.models import Profile

INFORMAL_OCCUPATIONS = {
    "gig_driver", "construction_worker", "domestic_worker",
    "street_vendor", "small_shopkeeper", "farmer",
}


def _member_at_least(p: Profile, years: int) -> bool | None:
    """True if self or any dependent is >= years; None if cannot tell."""
    if p.age is not None and p.age >= years:
        return True
    if any(d.age is not None and d.age >= years for d in p.dependents):
        return True
    if p.age is None or any(d.age is None for d in p.dependents):
        return None
    return False


def derive(p: Profile) -> dict[str, Any]:
    f: dict[str, Any] = p.model_dump(exclude={"dependents", "docs_held", "inferred"})
    f["annual_income_inr"] = (
        p.monthly_income_inr * 12 if p.monthly_income_inr is not None else None
    )
    senior = _member_at_least(p, 60)
    f["has_member_60plus"] = senior
    f["has_senior_in_household"] = senior
    f["has_member_70plus"] = _member_at_least(p, 70)
    f["has_girl_child_under_10"] = any(
        (d.gender or "").lower() == "female" and d.age is not None and d.age < 10
        for d in p.dependents
    )
    f["num_children"] = sum(
        1 for d in p.dependents
        if d.relation.lower() in {"son", "daughter", "child"}
        or (d.age is not None and d.age < 18)
    )
    f["is_informal_worker"] = (
        None if p.occupation is None else p.occupation in INFORMAL_OCCUPATIONS
    )
    f["is_female"] = None if p.gender is None else p.gender.lower() == "female"
    f["is_bpl"] = (
        None if p.ration_card_type is None
        else p.ration_card_type.lower() in {"bpl", "aay"}
    )
    f["age_group"] = (
        None if p.age is None
        else "child" if p.age < 18 else "adult" if p.age < 60 else "senior"
    )
    # Never derivable from speech: household presence on the PM-JAY list.
    f["in_pmjay_list"] = None
    return f
