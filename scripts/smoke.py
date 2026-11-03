"""Live end-to-end check: persona transcript -> profile -> match -> narrate (costs about Rs 1).

Run from the repo root:  py scripts/smoke.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

c = TestClient(app)
p = c.get("/api/fixtures/personas").json()[0]
print("persona:", p["name"], p["language_code"])

r = c.post("/api/profile", json={"transcript": p["transcript"], "language_code": p["language_code"]})
print("profile:", r.status_code, r.json() if r.status_code != 200 else r.json()["profile"])
r.raise_for_status()
prof = r.json()["profile"]

m = c.post("/api/match", json={"profile": prof, "docs_held": prof.get("docs_held", [])}).json()
for x in m["results"]:
    print(f'  {x["status"]:<13} {x["scheme"]["id"]}')

n = c.post("/api/narrate", json={"results": m["results"], "pocket": m["pocket"], "profile": prof,
                                  "language_code": p["language_code"]})
print("narrate:", n.status_code)
j = n.json()
print("script:", j.get("script"))
print("audio bytes(b64 chars):", len(j.get("audio_b64", "")), "degraded:", j.get("degraded"))
print("spend:", c.get("/api/health").json()["spend_inr"])
