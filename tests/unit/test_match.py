"""Spec for engine/match.py (SCHEMA.md §6). These tests skip until match.py exists.

match.py must provide:
    evaluate_rule(rule, facts, pack) -> "yes" | "no" | "unknown"
    match_steps(pack, facts) -> {step_id: "yes" | "unknown"}   (steps that are "no" are left out)

The `pack` fixture (tests/conftest.py) has three facts:
    color   enum  red / blue / not_sure (not_sure has "means_unknown": true)
    has_pet bool
    places  multi home / school
and two steps: "first" (always) and "second" (color == red, depends on first).
"""

import copy

import pytest

match = pytest.importorskip("engine.match", reason="engine/match.py not written yet")
evaluate_rule = match.evaluate_rule
match_steps = match.match_steps


def ev(rule, facts, pack):
    return evaluate_rule(rule, facts, pack)


# --- single rules -------------------------------------------------------------

def test_always_is_yes(pack):
    assert ev({"always": True}, {}, pack) == "yes"


@pytest.mark.parametrize("facts, expected", [
    ({"color": "red"}, "yes"),
    ({"color": "blue"}, "no"),
    ({}, "unknown"),                     # never answered
    ({"color": None}, "unknown"),        # answered with nothing
    ({"color": "not_sure"}, "unknown"),  # an option with "means_unknown": true
])
def test_eq_on_enum(pack, facts, expected):
    assert ev({"fact": "color", "eq": "red"}, facts, pack) == expected


@pytest.mark.parametrize("facts, expected", [
    ({"color": "red"}, "yes"),
    ({"color": "blue"}, "no"),
    ({}, "unknown"),
    ({"color": "not_sure"}, "unknown"),
])
def test_in(pack, facts, expected):
    assert ev({"fact": "color", "in": ["red", "green"]}, facts, pack) == expected


@pytest.mark.parametrize("facts, expected", [
    ({"has_pet": True}, "yes"),
    ({"has_pet": False}, "no"),
    ({}, "unknown"),
])
def test_eq_on_bool(pack, facts, expected):
    assert ev({"fact": "has_pet", "eq": True}, facts, pack) == expected


def test_eq_false_on_bool(pack):
    assert ev({"fact": "has_pet", "eq": False}, {"has_pet": False}, pack) == "yes"


@pytest.mark.parametrize("facts, expected", [
    ({"places": ["home", "school"]}, "yes"),
    ({"places": ["school"]}, "no"),
    ({"places": []}, "no"),   # answered: none of these
    ({}, "unknown"),          # never answered
])
def test_has(pack, facts, expected):
    assert ev({"fact": "places", "has": "home"}, facts, pack) == expected


@pytest.mark.parametrize("facts, expected", [
    ({"places": ["school"]}, "yes"),
    ({"places": ["home"]}, "yes"),
    ({"places": []}, "no"),
    ({}, "unknown"),
])
def test_has_any(pack, facts, expected):
    assert ev({"fact": "places", "has_any": ["home", "school"]}, facts, pack) == expected


def test_has_any_none_match(pack):
    pack["facts"][2]["options"].append({"value": "work", "label": "Work"})
    assert ev({"fact": "places", "has_any": ["home", "school"]}, {"places": ["work"]}, pack) == "no"


# --- combining rules ----------------------------------------------------------

RED = {"fact": "color", "eq": "red"}
PET = {"fact": "has_pet", "eq": True}


@pytest.mark.parametrize("facts, expected", [
    ({"color": "red", "has_pet": True}, "yes"),
    ({"color": "red", "has_pet": False}, "no"),
    ({"color": "blue"}, "no"),           # a "no" beats an "unknown"
    ({"color": "red"}, "unknown"),
    ({}, "unknown"),
])
def test_all(pack, facts, expected):
    assert ev({"all": [RED, PET]}, facts, pack) == expected


@pytest.mark.parametrize("facts, expected", [
    ({"color": "red", "has_pet": False}, "yes"),
    ({"color": "red"}, "yes"),            # a "yes" beats an "unknown"
    ({"color": "blue", "has_pet": False}, "no"),
    ({"color": "blue"}, "unknown"),
    ({}, "unknown"),
])
def test_any(pack, facts, expected):
    assert ev({"any": [RED, PET]}, facts, pack) == expected


@pytest.mark.parametrize("facts, expected", [
    ({"color": "red"}, "no"),
    ({"color": "blue"}, "yes"),
    ({}, "unknown"),                      # not unknown is still unknown
])
def test_not(pack, facts, expected):
    assert ev({"not": RED}, facts, pack) == expected


def test_nested_rules(pack):
    rule = {"all": [{"always": True}, {"any": [RED, {"not": PET}]}]}
    assert ev(rule, {"color": "blue", "has_pet": False}, pack) == "yes"
    assert ev(rule, {"color": "blue", "has_pet": True}, pack) == "no"
    assert ev(rule, {"color": "blue"}, pack) == "unknown"


def test_extra_facts_are_ignored(pack):
    assert ev(RED, {"color": "red", "something_else": 42}, pack) == "yes"


# --- match_steps ----------------------------------------------------------------

def test_match_steps_includes_yes_steps(pack):
    assert match_steps(pack, {"color": "red"}) == {"first": "yes", "second": "yes"}


def test_match_steps_leaves_out_no_steps(pack):
    assert match_steps(pack, {"color": "blue"}) == {"first": "yes"}


def test_match_steps_marks_unknown_steps(pack):
    assert match_steps(pack, {}) == {"first": "yes", "second": "unknown"}


def test_match_steps_does_not_change_facts(pack):
    facts = {"color": "red", "places": ["home"]}
    before = copy.deepcopy(facts)
    match_steps(pack, facts)
    assert facts == before


def test_match_steps_on_real_pack():
    from pathlib import Path

    from engine.pack_loader import load_pack

    real = load_pack(Path(__file__).resolve().parents[2] / "packs" / "financial_aid.json")
    result = match_steps(real, {"state": "ca", "citizenship_status": "undocumented_or_daca"})
    assert result["submit_cadaa"] == "yes"
    assert "submit_fafsa" not in result
    assert set(result.values()) <= {"yes", "unknown"}
