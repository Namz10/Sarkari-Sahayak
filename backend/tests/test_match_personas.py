from app.engine.match import compact_results, load_schemes, match_all
from app.models import Profile


def test_verified_catalogue_loads():
    assert len(load_schemes()) >= 4_000


def test_event_only_schemes_are_not_suggested_for_general_income_need():
    profile = Profile(age=34, state="MH", occupation="gig_driver", monthly_income_inr=15_000, needs=["income"])
    results = match_all(profile).results
    assert results
    assert all("accident" not in result.scheme.name.en.lower() for result in results)


def test_state_filter_and_result_contract():
    response = match_all(Profile(state="MP", needs=["farmer"]))
    assert response.results
    assert response.results[0].status == "confirm"
    assert compact_results(response)[0]["id"]


def test_sparse_profile_stays_conservative():
    response = match_all(Profile())
    assert response.results == []


def test_complete_old_age_pension_profile_can_be_marked_eligible():
    profile = Profile(
        name="Ramesh Patil", age=68, state="MH", occupation="retired",
        needs=["income"], ration_card_type="bpl", receives_other_pension=False,
    )
    result = next(r for r in match_all(profile).results if r.scheme.id == "igoapsm")
    assert result.status == "eligible"
    assert result.unknown_labels == []
    assert len(result.scheme.required_docs) == 10
    assert "Identity proof i" not in result.scheme.required_docs
    assert "e" not in result.scheme.required_docs


def test_existing_pension_prevents_old_age_pension_eligibility():
    profile = Profile(
        age=68, state="MH", occupation="retired", needs=["income"],
        ration_card_type="bpl", receives_other_pension=True,
    )
    result = next(r for r in match_all(profile).results if r.scheme.id == "igoapsm")
    assert result.status == "not_eligible"
    assert result.rules[0].outcome == "fail"
    assert result.failed_labels == ["Already receiving another pension"]


def test_missing_pension_facts_require_confirmation():
    profile = Profile(age=68, state="MH", occupation="retired", needs=["income"], ration_card_type="bpl")
    result = next(r for r in match_all(profile).results if r.scheme.id == "igoapsm")
    assert result.status == "confirm"
    assert "Not receiving another pension" in result.unknown_labels
