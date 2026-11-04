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
