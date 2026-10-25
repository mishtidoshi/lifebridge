"""API tests with FastAPI's test client."""

import logging

import pytest
from fastapi.testclient import TestClient

import app as app_module

client = TestClient(app_module.app)


@pytest.fixture(autouse=True)
def fresh_rate_limit(monkeypatch):
    monkeypatch.setattr(app_module, "understand_limiter", app_module.RateLimiter(3, 60))


def test_list_packs():
    packs = client.get("/api/packs").json()
    assert "financial_aid" in [p["id"] for p in packs]


def test_get_pack_facts():
    pack = client.get("/api/packs/financial_aid").json()
    grade = next(f for f in pack["facts"] if f["id"] == "grade_level")
    assert grade["type"] == "enum" and grade["options"][0]["value"] == "hs_senior"


def test_unknown_pack_is_404():
    assert client.get("/api/packs/nope").status_code == 404
    assert client.post("/api/plan", json={"pack_id": "nope", "facts": {}}).status_code == 404


def test_understand_returns_facts_and_evidence():
    res = client.post("/api/understand", json={"text": "I'm a senior applying to UCs", "pack_id": "financial_aid"})
    assert res.status_code == 200
    body = res.json()
    assert body["facts"] == {"grade_level": "hs_senior", "college_types": ["public_4yr"]}
    assert body["evidence"]["grade_level"] == ["senior"]


def test_understand_routes_without_pack_id():
    res = client.post("/api/understand", json={"text": "I need help with the FAFSA"})
    assert res.json()["pack_id"] == "financial_aid"


def test_understand_bad_input():
    assert client.post("/api/understand", json={"text": ""}).status_code == 400
    assert client.post("/api/understand", json={}).status_code == 422
    assert client.post("/api/understand", json={"text": "hi", "pack_id": "nope"}).status_code == 404


def test_understand_rate_limit():
    codes = [client.post("/api/understand", json={"text": "hi"}).status_code for _ in range(4)]
    assert codes == [200, 200, 200, 429]


def test_nothing_typed_is_logged(caplog):
    secret = "my mom is undocumented SECRET-PHRASE"
    with caplog.at_level(logging.DEBUG):
        client.post("/api/understand", json={"text": secret})
    assert "SECRET-PHRASE" not in caplog.text


def test_plan_before_engine_exists_or_after(monkeypatch):
    res = client.post("/api/plan", json={"pack_id": "financial_aid", "facts": {"grade_level": "hs_senior"},
                                         "today": "2026-10-15"})
    try:
        import engine.match  # noqa: F401
        import engine.sequence  # noqa: F401
    except ImportError:
        assert res.status_code == 501
        return
    assert res.status_code == 200
    body = res.json()
    assert body["today"] == "2026-10-15"
    assert body["steps"][0]["id"] == "choose_application"


def test_plan_reports_ignored_facts():
    pytest.importorskip("engine.match", reason="engine/match.py not written yet")
    pytest.importorskip("engine.sequence", reason="engine/sequence.py not written yet")
    res = client.post("/api/plan", json={"pack_id": "financial_aid", "facts": {"grade_level": "hs_freshman"}})
    assert res.status_code == 200
    assert res.json()["ignored_facts"]


def test_calendar_file_for_a_dated_deadline():
    res = client.get("/api/calendar/financial_aid/cal_grant_deadline.ics")
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/calendar")
    body = res.text
    assert "BEGIN:VEVENT" in body and "DTSTART;VALUE=DATE:20270302" in body and "TRIGGER:-P3D" in body
    assert all(len(line.encode()) <= 75 for line in body.split("\r\n"))


def test_calendar_file_for_a_date_from_a_letter():
    assert client.get("/api/calendar/medicaid/renewal_due.ics").status_code == 400
    res = client.get("/api/calendar/medicaid/renewal_due.ics?date=2027-01-31")
    assert res.status_code == 200 and "DTSTART;VALUE=DATE:20270131" in res.text
    assert client.get("/api/calendar/medicaid/nope.ics").status_code == 404


def test_questions_endpoint_gives_waves():
    res = client.post("/api/questions", json={"pack_id": "disaster", "facts": {}})
    assert res.status_code == 200
    body = res.json()
    assert [q["fact_id"] for q in body["questions"]] == ["phase"]  # required questions come alone first
    done = client.post("/api/questions", json={"pack_id": "disaster", "facts": {"phase": "preparing", "hazards": ["flood"]}}).json()
    assert done["done"] is True
