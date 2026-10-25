"""Spec for engine/changes.py ("What changed?").

Before-and-after cases: the expected added, removed, and confirmed steps were written
by hand from each step's applies_if rule before the code was run.
"""

import datetime
import json
from pathlib import Path

from engine.changes import compare_plans
from engine.pack_loader import load_all_packs

ROOT = Path(__file__).resolve().parents[2]
PACKS = load_all_packs(ROOT / "packs")
TODAY = datetime.date(2026, 10, 15)
DEMO = json.loads((ROOT / "tests/scenarios/financial_aid/01_demo_self_employed.json").read_text())["facts"]


def ids(entries):
    return {e["step_id"] for e in entries}


def test_nothing_changed():
    c = compare_plans(PACKS["financial_aid"], DEMO, DEMO, TODAY)
    assert not c["any"] and c["changed_facts"] == []


def test_switch_to_dream_act_path():
    after = {**DEMO, "citizenship_status": "undocumented_or_daca"}
    c = compare_plans(PACKS["financial_aid"], DEMO, after, TODAY)
    assert c["changed_facts"] == ["citizenship_status"]
    assert ids(c["added"]) == {"cadaa_create_account", "submit_cadaa"}
    assert ids(c["removed"]) == {"federal_aid_types", "fafsa_create_accounts", "parent_account_without_ssn", "submit_fafsa"}
    assert all("citizenship or immigration status" in e["reason"] for e in c["added"] + c["removed"])


def test_verification_request_confirms_the_step():
    # The 1-pager's example: the FAFSA is submitted, then a college asks for verification.
    order = ["choose_application", "federal_aid_types", "fafsa_create_accounts", "parent_account_without_ssn",
             "gather_documents", "list_colleges", "submit_fafsa"]
    c = compare_plans(PACKS["financial_aid"], DEMO, {**DEMO, "received_verification": True}, TODAY,
                      done_before=order, done_after=order)
    assert ids(c["confirmed"]) == {"respond_verification"}
    assert c["added"] == [] and c["removed"] == []
    assert "Yes" in c["confirmed"][0]["reason"]


def test_moving_states():
    c = compare_plans(PACKS["financial_aid"], DEMO, {**DEMO, "state": "tx"}, TODAY)
    assert {"confirm_gpa", "state_aid_ca", "webgrants_account"} <= ids(c["removed"])
    assert "state_aid_tx" in ids(c["added"])
    assert "alt_app_tx" not in ids(c["added"])  # a U.S. citizen files the FAFSA, not the TASFA


def test_marking_a_step_done_moves_next():
    c = compare_plans(PACKS["financial_aid"], DEMO, DEMO, TODAY, done_after=["choose_application"])
    assert c["next"] == {
        "before": "choose_application",
        "after": "federal_aid_types",
        "title": "Learn what federal aid the FAFSA can get you",
        "reason": "You marked \"Choose the right application: the FAFSA or your state's form\" done.",
    }
    assert c["added"] == [] and c["removed"] == []


def test_marking_several_steps_done():
    c = compare_plans(PACKS["financial_aid"], DEMO, DEMO, TODAY, done_after=["choose_application", "federal_aid_types"])
    assert c["next"]["reason"].startswith("You marked 2 steps done")


def test_medicaid_coverage_ended():
    before = {"state": "ca", "situation": ["renewal_letter"], "age_group": "19_to_64", "exemptions": ["none"]}
    after = {**before, "situation": ["renewal_letter", "coverage_ended"]}
    c = compare_plans(PACKS["medicaid"], before, after, TODAY)
    assert ids(c["added"]) == {"restore_coverage_ca", "fair_hearing_ca", "marketplace_ca"}
    assert c["added"][0]["reason"].startswith('You answered "What\'s going on with your coverage')
    assert c["next"] is not None and c["next"]["after"] == "restore_coverage_ca"
