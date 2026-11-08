import io
import zipfile

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import _json_object, _read_markdown_zip, app
from app.models import Profile


def test_json_object_handles_braces_inside_a_json_string():
    assert _json_object('prefix {"note":"use {exactly} this", "age": 34} trailing') == {
        "note": "use {exactly} this", "age": 34,
    }


def test_json_object_rejects_non_json_text():
    with pytest.raises(ValueError):
        _json_object("there is no structured result here")


def test_markdown_zip_is_read_with_a_safe_size_limit():
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, "w") as archive:
        archive.writestr("result.md", "hello")
        archive.writestr("ignore.txt", "not OCR")
    assert _read_markdown_zip(payload.getvalue()) == "hello"


def test_profile_normalizes_state_and_removes_duplicate_docs():
    profile = Profile(state=" mh ", docs_held=["aadhaar", " aadhaar ", ""])
    assert profile.state == "MH"
    assert profile.docs_held == ["aadhaar"]


def test_profile_rejects_impossible_values():
    with pytest.raises(ValidationError):
        Profile(age=131)


def test_favicon_endpoint_does_not_404():
    response = TestClient(app).get("/favicon.ico")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"


def test_question_prompt_construction_does_not_treat_json_keys_as_format_fields(monkeypatch):
    import asyncio
    import app.main as main

    async def fake_llm_json(system, user, max_tokens=900, model="sarvam-105b"):
        assert "Hindi" in system
        return {"question": "आप किस राज्य में रहते हैं?"}

    monkeypatch.setattr(main, "llm_json", fake_llm_json)
    response = asyncio.run(main.questions(main.QuestionsReq(profile=Profile(), language_code="hi-IN", attempts=0)))
    assert response["questions"][0]["text"] == "आप किस राज्य में रहते हैं?"


def test_report_pdf_returns_a_named_formatted_pdf():
    client = TestClient(app)
    response = client.post("/api/report.pdf", json={
        "profile": {"name": "Ramesh"},
        "filter": "all",
        "results": [{"status": "eligible", "unknown_labels": [], "scheme": {
            "name": {"en": "शेतकरी सहाय्य योजना"}, "category": "उपजीविका",
            "summary_en": "पात्र कामगारांसाठी ₹१०,००० मदत • अर्ज करा", "benefit": {"label_en": "प्रशिक्षण आणि अनुदान"},
            "required_docs": ["Aadhaar card", "Bank details"], "apply_url": "https://example.gov.in/apply",
        }}],
    })
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF-")
    from pypdf import PdfReader
    import io
    extracted = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(response.content)).pages)
    assert "Ramesh" in extracted
    assert "Prepared for: Ramesh" in extracted
    assert "शेतकरी सहाय्य योजना" in extracted
    assert "१०,०००" in extracted


@pytest.mark.parametrize("name", [
    "रमेश", "রমেশ", "રમેશ", "ਰਮੇਸ਼", "ରମେଶ", "ரமேஷ்", "రమేష్", "ರಮೇಶ್", "രമേഷ്",
])
def test_report_pdf_embeds_supported_indic_scripts(name):
    from app.main import ReportReq, report_pdf

    response = report_pdf(ReportReq(
        profile=Profile(name=name),
        filter="all",
        results=[{"status": "eligible", "unknown_labels": [], "scheme": {
            "name": {"en": "Old Age Pension"}, "category": "Social welfare",
            "summary_en": "Monthly support ₹600", "required_docs": ["Aadhaar card"],
        }}],
    ))
    from pypdf import PdfReader
    extracted = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(response.body)).pages)
    assert name in extracted


def test_report_pdf_preserves_latin_and_indic_runs_and_currency():
    from app.main import ReportReq, report_pdf
    from pypdf import PdfReader

    response = report_pdf(ReportReq(
        profile=Profile(name="Ramesh रमेश"), filter="all",
        results=[{"status": "eligible", "scheme": {
            "name": {"en": "Old Age Pension"}, "summary_en": "₹600 per month for pension support",
            "required_docs": ["Aadhaar card"],
        }}],
    ))
    extracted = "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(response.body)).pages)
    assert "Prepared for: Ramesh रमेश" in extracted
    assert "₹600 per month for pension support" in extracted


def test_profile_request_ignores_unknown_fields_to_avoid_stale_client_422():
    from app.main import ProfileReq
    req = ProfileReq.model_validate({"transcript":"माझे नाव रमेश आहे", "language_code":"mr-IN", "old_session_field":True})
    assert req.language_code == "mr-IN"
