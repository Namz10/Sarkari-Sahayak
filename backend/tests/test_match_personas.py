from app.engine.match import compact_results, load_schemes, match_all
from app.models import Dependent, Profile


def by_id(resp):
    return {r.scheme.id: r for r in resp.results}


def ramesh(**kw):
    base = dict(
        age=34, gender="male", state="MH", occupation="gig_driver",
        monthly_income_inr=15000, household_size=5,
        dependents=[
            Dependent(relation="mother", age=68, gender="female"),
            Dependent(relation="daughter", age=6, gender="female"),
            Dependent(relation="son", age=3, gender="male"),
        ],
        has_bank_account=True, is_income_tax_payer=False,
        is_epfo_esic_nps_member=False, docs_held=["aadhaar"],
    )
    base.update(kw)
    return Profile(**base)


def test_ten_schemes_load():
    assert len(load_schemes()) == 10


def test_ramesh():
    r = by_id(match_all(ramesh()))
    for sid in ("e_shram", "apy", "pmsby", "pmjjby"):
        assert r[sid].status == "almost", sid
        assert r[sid].missing_docs == ["bank_passbook"]
    assert r["pmjay"].status == "confirm"
    assert r["ignoaps"].status == "confirm"
    assert r["majhi_ladki_bahin"].status == "not_eligible"
    assert r["ladli_behna"].status == "not_eligible"

    resp = match_all(ramesh(), docs_held=["bank_passbook"])
    r = by_id(resp)
    for sid in ("e_shram", "apy", "pmsby", "pmjjby"):
        assert r[sid].status == "eligible", sid
    assert resp.pocket.eligible.cover == 600000
    assert resp.results[0].status == "eligible"
    assert compact_results(resp)[0]["id"]


def test_sita():
    p = Profile(age=45, gender="female", state="MP", occupation="farmer",
                owns_farmland=True, monthly_income_inr=10000,
                is_income_tax_payer=False, has_bank_account=True)
    r = by_id(match_all(p))
    assert r["ladli_behna"].status != "not_eligible"
    assert r["apy"].status == "not_eligible"
    assert r["majhi_ladki_bahin"].status == "not_eligible"


def test_kumar():
    p = Profile(age=62, gender="male", state="OD", occupation="retired",
                ration_card_type="bpl",
                docs_held=["aadhaar", "age_proof", "ration_card", "bank_passbook"])
    r = by_id(match_all(p))
    assert r["ignoaps"].status == "eligible"
    assert r["ladli_behna"].status == "not_eligible"


def test_sparse_profile():
    resp = match_all(Profile())
    statuses = {r.status for r in resp.results}
    assert "confirm" in statuses
    assert sum(r.status == "confirm" for r in resp.results) >= 7
    assert resp.pocket.eligible.cover == 0
