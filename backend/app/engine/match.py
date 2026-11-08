"""Verified CSV catalogue with conservative, intent-aware matching."""
from __future__ import annotations
import csv, re
from functools import lru_cache
from pathlib import Path
from app.models import Benefit, MatchResponse, Pocket, Profile, Result, ResultScheme, RuleOutcome

DATA_PATH = Path(__file__).resolve().parents[2] / "schemes.csv"
STATES = {"andhra pradesh":"AP","assam":"AS","bihar":"BR","chhattisgarh":"CG","gujarat":"GJ","karnataka":"KA","kerala":"KL","madhya pradesh":"MP","maharashtra":"MH","odisha":"OD","rajasthan":"RJ","sikkim":"SK","tamil nadu":"TN","telangana":"TG","uttar pradesh":"UP","uttarakhand":"UK","west bengal":"WB"}
TOPICS = {"income":("income","livelihood","employment","job","worker","skill","training","pension","wage","labor"),"farmer":("farm","farmer","crop","agriculture","land","kisan"),"health":("health","medical","hospital","insurance","maternity","pregnan","treatment"),"education":("education","student","school","scholarship","tuition"),"housing":("housing","home","house","shelter","homeless"),"business":("business","enterprise","self employment","startup","loan","entrepreneur")}
EVENT_ONLY = re.compile(r"\b(accident|emergency|ambulance|disaster|death|funeral|victim)\b", re.I)

@lru_cache(maxsize=1)
def _rows() -> tuple[dict[str,str], ...]:
    with DATA_PATH.open(encoding="utf-8-sig", newline="") as f: return tuple(csv.DictReader(f))
def load_schemes() -> list[dict[str,str]]: return list(_rows())
def _text(r: dict[str,str]) -> str: return " ".join(r.get(k, "") for k in ("scheme_name","categories","tags","brief_description","eligibility","exclusions")).lower()
def _docs(v: str) -> list[str]:
    parts = re.split(r"[;|\r\n]+|\s*[•◦▪]\s*", v or "")
    return [re.sub(r"^\s*(?:\d+[.)]\s*|[-*]\s*)", "", item).strip() for item in parts if item.strip()][:20]
def _score(r:dict[str,str], p:Profile) -> int:
    text=_text(r); state=(r.get("state") or "").strip().lower(); needs=set(p.needs)
    if p.state and state and state not in {"central","all india","india"} and STATES.get(state)!=p.state: return -1
    if EVENT_ONLY.search(text) and not needs.intersection({"accident","emergency","disaster","death"}): return -1
    matched_need = any(any(word in text for word in TOPICS.get(need,())) for need in needs)
    if not needs and not p.occupation and not p.pregnant_or_lactating and not p.owns_farmland: return -1
    score=10 if p.state and STATES.get(state)==p.state else 0
    for need in needs:
        if any(word in text for word in TOPICS.get(need,())): score+=25
    if needs and not matched_need: return -1
    if p.age is not None and p.age >= 60 and any(term in text for term in ("old age pension", "old-age pension", "senior citizen pension")):
        score += 20
    if p.occupation == "retired" and "old age pension" in (r.get("scheme_name") or "").lower():
        score += 12
    if p.occupation and any(w in text for w in p.occupation.replace("_"," ").split()): score+=8
    if p.pregnant_or_lactating and "maternity" in text: score+=12
    return score

def _eligibility_status(r: dict[str,str], p: Profile) -> tuple[str, list[str]]:
    """Mark eligible only when every material criterion is explicitly evaluated."""
    criteria = (r.get("eligibility") or "").lower().strip()
    exclusions = (r.get("exclusions") or "").lower().strip()
    checks: list[tuple[bool | None, str]] = []
    recognized: set[str] = set()
    clauses = [part.strip(" ,") for part in re.split(r"[.;]+", criteria) if part.strip(" ,")]

    state = (r.get("state") or "").strip().lower()
    if state not in {"", "central", "all india", "india"}:
        code = STATES.get(state)
        checks.append((None if not p.state or not code else p.state == code, f"Resident of {r.get('state')}"))
        if any(word in clause for clause in clauses for word in ("resident", "residing", "state of")):
            recognized.update(clause for clause in clauses if any(word in clause for word in ("resident", "residing", "state of")))

    age_number = re.compile(r"(\d{2,3})\s*years?", re.I)
    for clause in clauses:
        if any(term in clause for term in ("below poverty line", "bpl family", "bpl household")):
            checks.append((None if not p.ration_card_type else p.ration_card_type in {"bpl", "aay"}, "BPL household"))
            recognized.add(clause)
        elif "age" in clause or "aged" in clause:
            found_age = age_number.search(clause)
            if not found_age:
                continue
            minimum = int(found_age.group(1))
            checks.append((None if p.age is None else p.age >= minimum, f"At least {minimum} years old"))
            recognized.add(clause)
        elif any(term in clause for term in ("should be a woman", "woman applicant", "only women", "women applicants", "female applicant")):
            checks.append((None if not p.gender else p.gender == "female", "Woman applicant"))
            recognized.add(clause)
        elif any(term in clause for term in ("owns agricultural land", "land-owning farmer", "farmer owning land")):
            checks.append((p.owns_farmland, "Own agricultural land"))
            recognized.add(clause)
        elif "pension" in clause and any(term in clause for term in ("not be receiving", "not receive", "should not receive", "does not receive")):
            checks.append((None if p.receives_other_pension is None else not p.receives_other_pension, "Not receiving another pension"))
            recognized.add(clause)
        elif any(term in clause for term in ("annual income", "yearly income", "family income")):
            income_match = re.search(r"(?:annual|yearly|family) income.{0,60}?(?:less than|below|not exceed|up to|maximum of)\s*(?:₹|rs\.?\s*)?([\d,.]+)\s*(lakh|lakhs)?", clause)
            if income_match:
                limit = float(income_match.group(1).replace(",", "")) * (100000 if income_match.group(2) else 1)
                checks.append((None if p.monthly_income_inr is None else p.monthly_income_inr * 12 <= limit, "Income within the scheme limit"))
                recognized.add(clause)

    unknown = [label for passed, label in checks if passed is None]
    for clause in clauses:
        if clause not in recognized:
            unknown.append("Confirm: " + clause[:120])
    if not criteria:
        unknown.append("Eligibility criteria are not listed")
    if exclusions:
        if "pension" in exclusions and p.receives_other_pension:
            return "not_eligible", ["Already receiving another pension"]
        if any(term in exclusions for term in ("government employee", "government pensioner", "epfo", "esic", "nps")):
            if p.is_epfo_esic_nps_member is True:
                return "not_eligible", ["Scheme exclusions may apply"]
            if p.is_epfo_esic_nps_member is None:
                unknown.append("Confirm government employment or pension exclusions")
        elif exclusions:
            unknown.append("Confirm scheme exclusions")
    for passed, label in checks:
        if passed is False:
            if label == "Not receiving another pension":
                label = "Already receiving another pension"
            return "not_eligible", [label]
    return ("confirm", list(dict.fromkeys(unknown))) if unknown else ("eligible", [])
def _result(r:dict[str,str], score:int, profile:Profile) -> Result:
    status, unknown = _eligibility_status(r, profile)
    return Result(scheme=ResultScheme(id=r["slug"],name={"en":r["scheme_name"],"hi":""},level="central" if "central" in (r.get("level")or"").lower() else "state",category=r.get("categories")or"Other",summary_en=r.get("brief_description")or"",benefit=Benefit(kind="access",label_en=(r.get("benefits")or"Available support")[:180],counts_in_pocket=False),required_docs=_docs(r.get("documents_required", "")),how_to_apply_en=r.get("application_process")or r.get("application_mode")or"See the official page.",apply_url=r.get("source_url")or None,source_url=r.get("references")or r.get("source_url")or None),status=status,rules=[RuleOutcome(id="official_eligibility",outcome="fail" if status == "not_eligible" else "unknown" if unknown else "pass",label_en=(r.get("eligibility")or"Confirm eligibility with the department")[:350])],unknown_labels=unknown,failed_labels=unknown if status == "not_eligible" else [],score=score)
def match_all(profile:Profile, docs_held:list[str]|None=None) -> MatchResponse:
    ranked=sorted(((_score(r,profile),r) for r in _rows()),key=lambda x:x[0],reverse=True)
    return MatchResponse(results=[_result(r,s,profile) for s,r in ranked if s>=0][:20],pocket=Pocket(),schemes_version="verified-csv-4670",verified_on="provided schemes.csv")
def compact_results(resp:MatchResponse)->list[dict]:
    return [{"id":r.scheme.id,"name_en":r.scheme.name.en,"status":r.status,"benefit":r.scheme.benefit.label_en,"amount_inr":0,"missing_docs":[],"unknown_labels":r.unknown_labels} for r in resp.results]
