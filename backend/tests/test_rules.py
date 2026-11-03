import pytest

from app.engine.derive import derive
from app.engine.rules import evaluate_rule
from app.models import Dependent, Profile, Rule


def R(field, op, value=None):
    return Rule(id="r", field=field, op=op, value=value, label_en="x")


CASES = [
    ("eq", "a", "a", "pass"), ("eq", "a", "b", "fail"), ("eq", None, "a", "unknown"),
    ("neq", "a", "b", "pass"), ("neq", "a", "a", "fail"), ("neq", None, "a", "unknown"),
    ("in", "a", ["a", "b"], "pass"), ("in", "c", ["a", "b"], "fail"), ("in", None, ["a"], "unknown"),
    ("not_in", "c", ["a"], "pass"), ("not_in", "a", ["a"], "fail"), ("not_in", None, ["a"], "unknown"),
    ("gte", 60, 60, "pass"), ("gte", 59, 60, "fail"), ("gte", None, 60, "unknown"),
    ("lte", 40, 40, "pass"), ("lte", 41, 40, "fail"), ("lte", None, 40, "unknown"),
    ("between", 18, [18, 40], "pass"), ("between", 40, [18, 40], "pass"),
    ("between", 41, [18, 40], "fail"), ("between", 17, [18, 40], "fail"),
    ("between", None, [18, 40], "unknown"),
    ("is_true", True, None, "pass"), ("is_true", False, None, "fail"), ("is_true", None, None, "unknown"),
    ("is_false", False, None, "pass"), ("is_false", True, None, "fail"), ("is_false", None, None, "unknown"),
    ("exists", 0, None, "pass"), ("exists", None, None, "fail"),
]


@pytest.mark.parametrize("op,val,ref,expected", CASES)
def test_operators(op, val, ref, expected):
    assert evaluate_rule(R("f", op, ref), {"f": val}) == expected


def test_missing_field_is_unknown():
    assert evaluate_rule(R("nope", "eq", 1), {}) == "unknown"


def test_derived_senior():
    assert derive(Profile(age=59, dependents=[]))["has_senior_in_household"] is False
    assert derive(Profile(age=60))["has_senior_in_household"] is True
    assert derive(Profile(age=30, dependents=[Dependent(relation="mother", age=60)]))["has_member_60plus"] is True
    assert derive(Profile())["has_senior_in_household"] is None


def test_derived_misc():
    d = derive(Profile(monthly_income_inr=1000, occupation="farmer", gender="female",
                       ration_card_type="aay"))
    assert d["annual_income_inr"] == 12000
    assert d["is_informal_worker"] and d["is_female"] and d["is_bpl"]
    assert derive(Profile())["is_bpl"] is None
    assert derive(Profile(occupation="retired"))["is_informal_worker"] is False
