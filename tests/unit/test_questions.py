"""Spec for engine/questions.py: ask in waves, most important first, only when the answer matters."""

from pathlib import Path

from engine.pack_loader import load_all_packs
from engine.questions import impact, needed_questions, next_wave

PACKS = load_all_packs(Path(__file__).resolve().parents[2] / "packs")
FA, MEDICAID, DISASTER = PACKS["financial_aid"], PACKS["medicaid"], PACKS["disaster"]


def ids(questions):
    return [q["fact_id"] for q in questions]


def test_required_questions_come_first():
    assert ids(needed_questions(FA, {}))[0] == "state"
    assert next_wave(MEDICAID, {})["questions"][0]["fact_id"] == "state"


def test_questions_that_cant_change_the_plan_are_not_asked():
    # Someone 65 or older isn't covered by the work rules, so those questions are skipped.
    asked = ids(needed_questions(MEDICAID, {"state": "tx", "age_group": "65_plus"}))
    assert "exemptions" not in asked and "got_work_rules_notice" not in asked and "activities" not in asked
    # Getting ready for a disaster: only which disasters matters now.
    assert ids(needed_questions(DISASTER, {"phase": "preparing"})) == ["hazards"]


def test_answered_and_skipped_questions_are_not_asked_again():
    assert "state" not in ids(needed_questions(FA, {"state": "ca"}))
    assert "citizenship_status" not in ids(needed_questions(FA, {"state": "ca"}, asked=["citizenship_status"]))
    assert "citizenship_status" not in ids(needed_questions(FA, {"state": "ca", "citizenship_status": "not_sure"}))


def test_bigger_impact_first():
    questions = needed_questions(FA, {"state": "ca"})
    scores = [q["impact"] for q in questions if not q["required"]]
    assert scores == sorted(scores, reverse=True)


def test_checklist_changes_count():
    # Self-employed parents only add a document (business records), but that still matters.
    fact = next(f for f in FA["facts"] if f["id"] == "parent_self_employed")
    assert impact(FA, {"state": "ca", "citizenship_status": "us_citizen"}, fact) >= 1


def test_required_questions_get_their_own_wave():
    # "Where are you right now?" decides whether damage and insurance questions matter, so it's asked alone.
    wave = next_wave(DISASTER, {})
    assert ids(wave["questions"]) == ["phase"] and wave["remaining"] > 0 and not wave["done"]


def test_waves_are_small_and_finish():
    wave = next_wave(DISASTER, {"phase": "recovering"})
    assert len(wave["questions"]) == 3 and not wave["done"]
    facts = {"phase": "preparing", "hazards": ["wildfire"]}
    assert next_wave(DISASTER, facts) == {"questions": [], "remaining": 0, "done": True}
