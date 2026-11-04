"""Pydantic v2 models for Sarkari Sahayak (SPEC section 8)."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Dependent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    relation: str = Field(min_length=1, max_length=40)
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None


class Profile(BaseModel):
    model_config = ConfigDict(extra="ignore")
    age: Optional[int] = Field(default=None, ge=0, le=130)
    gender: Optional[str] = None
    state: Optional[str] = Field(default=None, min_length=2, max_length=2)
    occupation: Optional[str] = Field(default=None, max_length=60)
    monthly_income_inr: Optional[int] = Field(default=None, ge=0, le=10_000_000)
    household_size: Optional[int] = Field(default=None, ge=1, le=100)
    dependents: list[Dependent] = Field(default_factory=list, max_length=30)
    pregnant_or_lactating: Optional[bool] = None
    owns_farmland: Optional[bool] = None
    is_income_tax_payer: Optional[bool] = None
    is_epfo_esic_nps_member: Optional[bool] = None
    has_bank_account: Optional[bool] = None
    ration_card_type: Optional[str] = None
    docs_held: list[str] = Field(default_factory=list, max_length=30)
    inferred: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("state", mode="before")
    @classmethod
    def normalize_state(cls, value: object) -> object:
        return value.upper().strip() if isinstance(value, str) else value

    @field_validator("docs_held", "inferred", mode="before")
    @classmethod
    def unique_strings(cls, value: object) -> object:
        if not isinstance(value, list):
            return value
        return list(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))


class LocalizedName(BaseModel):
    en: str
    hi: str = ""


class Benefit(BaseModel):
    kind: Literal["cover", "monthly", "yearly", "one_time", "access"]
    amount_inr: int = 0
    label_en: str = ""
    counts_in_pocket: bool = True


class Rule(BaseModel):
    id: str
    field: str
    op: Literal[
        "eq", "neq", "in", "not_in", "gte", "lte", "between",
        "is_true", "is_false", "exists",
    ]
    value: Any = None
    hard: bool = True
    label_en: str = ""


class Scheme(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: LocalizedName
    level: Literal["central", "state"] = "central"
    states: Optional[list[str]] = None
    category: str
    summary_en: str = ""
    benefit: Benefit
    rules: list[Rule] = Field(default_factory=list)
    required_docs: list[str] = Field(default_factory=list)
    optional_docs: list[str] = Field(default_factory=list)
    how_to_apply_en: str = ""
    apply_url: Optional[str] = None
    helpline: Optional[str] = None
    source_url: Optional[str] = None
    last_verified: str = "unverified"


Outcome = Literal["pass", "fail", "unknown"]
Status = Literal["eligible", "almost", "confirm", "not_eligible"]


class RuleOutcome(BaseModel):
    id: str
    outcome: Outcome
    label_en: str = ""


class ResultScheme(BaseModel):
    id: str
    name: LocalizedName
    level: str
    category: str
    summary_en: str
    benefit: Benefit
    required_docs: list[str]
    how_to_apply_en: str
    apply_url: Optional[str] = None
    source_url: Optional[str] = None


class Result(BaseModel):
    scheme: ResultScheme
    status: Status
    rules: list[RuleOutcome]
    missing_docs: list[str] = Field(default_factory=list)
    unknown_labels: list[str] = Field(default_factory=list)
    failed_labels: list[str] = Field(default_factory=list)
    score: int = 0


class PocketBucket(BaseModel):
    cover: int = 0
    monthly: int = 0
    yearly: int = 0
    one_time: int = 0


class Pocket(BaseModel):
    eligible: PocketBucket = Field(default_factory=PocketBucket)
    almost: PocketBucket = Field(default_factory=PocketBucket)


class MatchResponse(BaseModel):
    results: list[Result]
    pocket: Pocket
    schemes_version: str
    verified_on: str
