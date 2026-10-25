"""Tests for engine/plan.py and engine/facts.py.

The helpers (deadlines, "why" text, cleaning facts) are tested now. The full
build_plan tests need match.py and sequence.py, so they skip until those exist.
"""

import datetime
from pathlib import Path

import pytest

from engine.facts import NOT_SURE, answer_label, answered_not_sure, clean_facts, facts_for_rules, known_value
from engine.pack_loader import load_pack
from engine.plan import (
    add_months, cycle_warning, deadline_date, deadline_status, rule_fact_ids, unknown_fact_ids, why_text,
)

D = datetime.date
REAL_PACK = Path(__file__).resolve().parents[2] / "packs" / "financial_aid.json"


# --- clean_facts --------------------------------------------------------------

def test_clean_facts_keeps_valid_values(pack):
    facts, dropped = clean_facts(pack, {"color": "red", "has_pet": False, "places": ["school", "home"]})
    assert facts == {"color": "red", "has_pet": False, "places": ["home", "school"]}  # pack order
    assert dropped == []


@pytest.mark.parametrize("raw", [
    {"color": "green"},
    {"has_pet": "yes"},
    {"places": ["moon"]},
    {"places": "home"},
    {"made_up": 1},
])
def test_clean_facts_drops_bad_values(pack, raw):
    facts, dropped = clean_facts(pack, raw)
    assert facts == {} and len(dropped) == 1


def test_clean_facts_skips_none(pack):
    assert clean_facts(pack, {"color": None}) == ({}, [])


def test_not_sure_is_a_valid_answer_for_bool_facts(pack):
    facts, dropped = clean_facts(pack, {"has_pet": NOT_SURE})
    assert facts == {"has_pet": NOT_SURE} and dropped == []
    assert answer_label(pack["facts"][1], NOT_SURE) == "Not sure"


def test_not_sure_is_answered_but_unknown(pack):
    facts = {"color": "not_sure", "has_pet": NOT_SURE, "places": ["home"]}
    assert answered_not_sure(pack, facts) == {"color", "has_pet"}
    assert known_value(pack["facts"][1], facts) is None
    assert facts_for_rules(pack, facts) == {"color": "not_sure", "places": ["home"]}  # rules see "no answer"


def test_known_value_treats_not_sure_as_unknown(pack):
    color = pack["facts"][0]
    assert known_value(color, {"color": "not_sure"}) is None
    assert known_value(color, {"color": "red"}) == "red"


def test_answer_labels(pack):
    color, pet, places = pack["facts"]
    assert answer_label(color, "red") == "Red"
    assert answer_label(pet, True) == "Yes"
    assert answer_label(places, ["home", "school"]) == "Home, School"
    assert answer_label(places, []) == "None of these"


# --- "why this applies" -----------------------------------------------------------

def test_rule_fact_ids_walks_every_combiner():
    rule = {"all": [{"fact": "a", "eq": 1}, {"any": [{"not": {"fact": "b", "eq": 2}}, {"fact": "a", "eq": 3}]}]}
    assert rule_fact_ids(rule) == ["a", "b"]


def test_why_text_names_the_users_answers(pack):
    rule = {"all": [{"fact": "color", "eq": "red"}, {"fact": "has_pet", "eq": True}]}
    assert why_text(rule, {"color": "red"}, pack) == ["What color? You said: Red"]


def test_why_text_for_always(pack):
    assert "everyone" in why_text({"always": True}, {}, pack)[0]


def test_unknown_fact_ids(pack):
    rule = {"any": [{"fact": "color", "eq": "red"}, {"fact": "has_pet", "eq": True}]}
    assert unknown_fact_ids(rule, {"color": "not_sure", "has_pet": False}, pack) == ["color"]


# --- deadlines --------------------------------------------------------------------

def test_add_months_clamps_to_month_end():
    assert add_months(D(2027, 1, 31), 1) == D(2027, 2, 28)
    assert add_months(D(2026, 11, 15), 6) == D(2027, 5, 15)


def test_fixed_deadline_date():
    assert deadline_date({"date": "2027-03-02"}, {}, D(2026, 10, 15)) == D(2027, 3, 2)


def test_deadline_from_letter_date():
    dl = {"date": None, "from_fact": "letter", "offset_days": 30}
    assert deadline_date(dl, {"letter": "2026-10-01"}, D(2026, 10, 15)) == D(2026, 10, 31)
    assert deadline_date(dl, {}, D(2026, 10, 15)) is None


def test_repeating_deadline_shows_next_one():
    dl = {"date": None, "from_fact": "letter", "offset_days": 0, "repeat_months": 6}
    assert deadline_date(dl, {"letter": "2026-01-31"}, D(2026, 10, 15)) == D(2027, 1, 31)


@pytest.mark.parametrize("day, expected", [
    (None, "needs_date"),
    (D(2026, 10, 14), "passed"),
    (D(2026, 10, 15), "soon"),      # the day of
    (D(2026, 10, 29), "soon"),      # 14 days out
    (D(2026, 10, 30), "upcoming"),
])
def test_deadline_status(day, expected):
    assert deadline_status(day, D(2026, 10, 15)) == expected


def test_cycle_warning():
    pack = {"cycle": {"label": "2027–28 school year", "starts": "2026-10-01", "ends": "2028-06-30"}}
    assert cycle_warning(pack, D(2026, 10, 15)) is None
    assert "outside" in cycle_warning(pack, D(2026, 9, 30))
    assert cycle_warning({}, D(2026, 9, 30)) is None


# --- build_plan (needs the student's match.py and sequence.py) ----------------------

@pytest.fixture
def build_plan():
    pytest.importorskip("engine.match", reason="engine/match.py not written yet")
    pytest.importorskip("engine.sequence", reason="engine/sequence.py not written yet")
    from engine.plan import build_plan
    return build_plan


DEMO_FACTS = {
    "state": "ca",
    "grade_level": "hs_senior",
    "citizenship_status": "us_citizen",
    "dependency_status": "dependent",
    "parent_self_employed": True,
    "college_types": ["public_4yr"],
}


def test_plan_shape(build_plan):
    plan = build_plan(load_pack(REAL_PACK), DEMO_FACTS, D(2026, 10, 15))
    assert plan["next_step"] == "choose_application"
    assert plan["cycle_warning"] is None
    ids = [s["id"] for s in plan["steps"]]
    assert "submit_fafsa" in ids and "submit_cadaa" not in ids


def test_documents_listed_once_with_their_steps(build_plan):
    plan = build_plan(load_pack(REAL_PACK), DEMO_FACTS, D(2026, 10, 15))
    names = [d["id"] for d in plan["documents"]]
    assert len(names) == len(set(names))
    assert "business_records" in names  # parents are self-employed
    assert all(d["used_by"] for d in plan["documents"])


def test_documents_that_dont_apply_are_left_out(build_plan):
    facts = dict(DEMO_FACTS, parent_self_employed=False)
    plan = build_plan(load_pack(REAL_PACK), facts, D(2026, 10, 15))
    assert "business_records" not in [d["id"] for d in plan["documents"]]


def test_passed_deadline_shows_if_missed(build_plan):
    plan = build_plan(load_pack(REAL_PACK), DEMO_FACTS, D(2027, 3, 3))
    cal_grant = next(d for d in plan["deadlines"] if d["id"] == "cal_grant_deadline")
    assert cal_grant["status"] == "passed"


def test_done_if_marks_steps_done_and_moves_next_step(build_plan):
    facts = dict(DEMO_FACTS, application_status="submitted")
    plan = build_plan(load_pack(REAL_PACK), facts, D(2026, 10, 15))
    done = {s["id"] for s in plan["steps"] if s["done_at_start"]}
    assert {"choose_application", "submit_fafsa"} <= done
    assert plan["next_step"] not in done


def test_questions_box_lists_facts_that_settle_may_apply_steps(build_plan):
    plan = build_plan(load_pack(REAL_PACK), DEMO_FACTS, D(2026, 10, 15))
    asked = {q["fact_id"]: q["settles"] for q in plan["questions"]}
    assert asked["parent_ssn"] == ["parent_account_without_ssn"]
    assert asked["received_verification"] == ["respond_verification"]


def test_junior_notice(build_plan):
    facts = dict(DEMO_FACTS, grade_level="hs_junior")
    plan = build_plan(load_pack(REAL_PACK), facts, D(2026, 10, 15))
    assert [n["id"] for n in plan["notices"]] == ["junior_next_cycle"]
    assert plan["steps"]  # not stop_plan, so steps still show


@pytest.mark.parametrize("fact_id, value", [("received_verification", NOT_SURE), ("parent_ssn", "not_sure")])
def test_not_sure_stops_the_question_but_step_still_may_apply(build_plan, fact_id, value):
    before = build_plan(load_pack(REAL_PACK), DEMO_FACTS, D(2026, 10, 15))
    assert fact_id in {q["fact_id"] for q in before["questions"]}

    plan = build_plan(load_pack(REAL_PACK), dict(DEMO_FACTS, **{fact_id: value}), D(2026, 10, 15))
    assert fact_id not in {q["fact_id"] for q in plan["questions"]}  # answered, so not asked again
    step_id = before["questions"][[q["fact_id"] for q in before["questions"]].index(fact_id)]["settles"][0]
    step = next(s for s in plan["steps"] if s["id"] == step_id)
    assert step["match"] == "unknown"  # still "May apply": "Not sure" doesn't settle it


# --- states: federal steps for everyone, state steps only for your state -------------------------

@pytest.mark.parametrize("state", ["tx", "ny", "wy", "ca"])
def test_federal_steps_for_every_state(build_plan, state):
    plan = build_plan(load_pack(REAL_PACK), dict(DEMO_FACTS, state=state), D(2026, 10, 15))
    ids = [s["id"] for s in plan["steps"]]
    for federal in ["federal_aid_types", "fafsa_create_accounts", "submit_fafsa", "compare_offers"]:
        assert federal in ids
    state_steps = [i for i in ids if i.startswith("state_aid_")]
    assert state_steps == [f"state_aid_{state}"]  # only your own state's step


def test_texas_deadline_moves_fafsa_up(build_plan):
    plan = build_plan(load_pack(REAL_PACK), dict(DEMO_FACTS, state="tx"), D(2026, 10, 15))
    tx = next(d for d in plan["deadlines"] if d["id"] == "tx_deadline")
    assert tx["date"] == "2027-01-15" and tx["kind"] == "priority"
    assert [s["id"] for s in plan["steps"]].index("submit_fafsa") < [s["id"] for s in plan["steps"]].index("review_submission")
    assert "cal_grant_deadline" not in [d["id"] for d in plan["deadlines"]]  # no California dates outside California


def test_asap_deadline_is_marked(build_plan):
    plan = build_plan(load_pack(REAL_PACK), dict(DEMO_FACTS, state="il"), D(2026, 10, 15))
    il = next(d for d in plan["deadlines"] if d["id"] == "il_deadline")
    assert il["asap"] is True and il["date"] is None
    assert plan["deadlines"][0]["id"] == "il_deadline"  # most urgent, so listed first


def test_undocumented_student_in_a_state_with_its_own_application(build_plan):
    facts = dict(DEMO_FACTS, state="wa", citizenship_status="undocumented_or_daca")
    ids = [s["id"] for s in build_plan(load_pack(REAL_PACK), facts, D(2026, 10, 15))["steps"]]
    assert "alt_app_wa" in ids and "state_aid_wa" in ids
    assert "submit_fafsa" not in ids and "undocumented_other_aid" not in ids
    assert ids.index("alt_app_wa") < ids.index("state_aid_wa")


def test_undocumented_student_in_a_state_without_one(build_plan):
    facts = dict(DEMO_FACTS, state="al", citizenship_status="undocumented_or_daca")
    ids = [s["id"] for s in build_plan(load_pack(REAL_PACK), facts, D(2026, 10, 15))["steps"]]
    assert "undocumented_other_aid" in ids
    assert "state_aid_al" not in ids and not any(i.startswith("alt_app_") for i in ids)


# --- Trust fields: "Why this matters", "Still stuck?", "How this plan was made" -------

def test_real_plans_carry_trust_fields():
    import datetime
    from pathlib import Path

    from engine.pack_loader import load_all_packs
    from engine.plan import build_plan

    packs = load_all_packs(Path(__file__).resolve().parents[2] / "packs")
    plan = build_plan(packs["medicaid"], {"state": "tx"}, datetime.date(2026, 10, 15))
    assert plan["why_it_matters"]["text"].startswith("Medicaid")
    assert [h["id"] for h in plan["help"]] == ["state_medicaid_agency"]  # the California option is hidden
    step = plan["steps"][0]
    assert step["ai_drafted"] is True and step["review_status"] == "draft" and step["verified_by"] is None

    fa = build_plan(packs["financial_aid"], {"state": "ca"}, datetime.date(2026, 10, 15))
    assert {h["id"] for h in fa["help"]} == {"fsa_info_center", "congress_casework"}
    judgment = [s for s in fa["steps"] if s["judgment"]]
    assert [s["id"] for s in judgment] == ["college_extra_forms"]
