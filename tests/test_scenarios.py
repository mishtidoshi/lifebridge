"""Scenario tests: realistic people run through the engine, checked against a plan
a person wrote by hand from official sources.

Each file in tests/scenarios/<pack_id>/ looks like:

    {
      "name": "...",
      "today": "2026-10-15",                            # the date the plan is built for
      "input_text": "what the person would type",       # used later by Understand tests
      "facts": {"fact_id": value, ...},                 # facts given directly, so no AI is needed
      "expected": {
        "steps_in_order": ["step_id", ...],             # the whole plan, in order
        "may_apply": ["step_id", ...],                  # steps marked "May apply — check this"
        "not_included": ["step_id", ...]                # steps that must NOT be in the plan
      }
    }

Facts not listed are unknown. Two groups of tests:
- format checks (run now): the scenario only uses real facts, values and step ids.
- plan checks (run once engine/match.py and engine/sequence.py exist).
"""

import datetime
import json
from pathlib import Path

import pytest

from engine.pack_loader import load_pack

ROOT = Path(__file__).resolve().parent.parent
PACKS_DIR = ROOT / "packs"
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
MIN_SCENARIOS_FOR_VERIFIED_PACK = 5

SCENARIO_FILES = sorted(SCENARIOS_DIR.glob("*/*.json"))


def _load(path):
    scenario = json.loads(path.read_text(encoding="utf-8"))
    pack = load_pack(PACKS_DIR / f"{path.parent.name}.json")
    return scenario, pack


def _ids(path):
    return f"{path.parent.name}/{path.stem}"


# --- Format checks ----------------------------------------------------------

@pytest.mark.parametrize("path", SCENARIO_FILES, ids=_ids)
def test_scenario_is_well_formed(path):
    scenario, pack = _load(path)
    facts = {f["id"]: f for f in pack["facts"]}
    steps = {s["id"] for s in pack["steps"]}

    for fact_id, value in scenario["facts"].items():
        assert fact_id in facts, f"unknown fact '{fact_id}'"
        fact = facts[fact_id]
        allowed = {o["value"] for o in fact.get("options", [])}
        if fact["type"] == "enum":
            assert value in allowed, f"{fact_id}: {value!r} is not an option"
        elif fact["type"] == "multi":
            assert isinstance(value, list) and set(value) <= allowed, f"{fact_id}: bad values {value!r}"
        elif fact["type"] == "bool":
            assert isinstance(value, bool), f"{fact_id}: must be true/false"

    expected = scenario["expected"]
    in_order = expected["steps_in_order"]
    for key in ("steps_in_order", "may_apply", "not_included"):
        unknown = set(expected.get(key, [])) - steps
        assert not unknown, f"{key} has unknown step ids: {sorted(unknown)}"
    datetime.date.fromisoformat(scenario["today"])
    assert len(in_order) == len(set(in_order)), "steps_in_order lists a step twice"
    assert set(expected.get("may_apply", [])) <= set(in_order), "may_apply steps must also be in steps_in_order"
    assert not set(expected.get("not_included", [])) & set(in_order), "a step is both included and not_included"


@pytest.mark.parametrize("path", sorted(PACKS_DIR.glob("*.json")), ids=lambda p: p.stem)
def test_verified_packs_have_enough_scenarios(path):
    pack = load_pack(path)
    count = len(list((SCENARIOS_DIR / pack["id"]).glob("*.json")))
    if pack["status"] != "verified":
        pytest.skip(f"draft pack ({count}/{MIN_SCENARIOS_FOR_VERIFIED_PACK} scenarios so far)")
    assert count >= MIN_SCENARIOS_FOR_VERIFIED_PACK


# --- Plan checks (switch on automatically when the engine exists) -----------

@pytest.mark.parametrize("path", SCENARIO_FILES, ids=_ids)
def test_scenario_plan(path):
    match = pytest.importorskip("engine.match", reason="engine/match.py not written yet")
    sequence = pytest.importorskip("engine.sequence", reason="engine/sequence.py not written yet")
    scenario, pack = _load(path)
    expected = scenario["expected"]

    matched = match.match_steps(pack, scenario["facts"])   # {step_id: "yes" | "unknown"}
    today = datetime.date.fromisoformat(scenario["today"])
    ordered = sequence.order_steps(pack, matched, today)   # [step_id, ...]

    assert ordered == expected["steps_in_order"]
    assert {s for s, a in matched.items() if a == "unknown"} == set(expected.get("may_apply", []))
