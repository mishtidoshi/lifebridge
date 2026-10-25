"""Spec for engine/sequence.py (SCHEMA.md §7). These tests skip until sequence.py exists.

sequence.py must provide:
    effective_deadlines(pack, matched, today) -> {step_id: datetime.date | None}
    order_steps(pack, matched, today) -> [step_id, ...]

`matched` is what match_steps returns: {step_id: "yes" | "unknown"}. Steps not in
`matched` are not in the plan. "unknown" steps are ordered exactly like "yes" steps.
"""

import datetime

import pytest

sequence = pytest.importorskip("engine.sequence", reason="engine/sequence.py not written yet")
order_steps = sequence.order_steps
effective_deadlines = sequence.effective_deadlines

TODAY = datetime.date(2026, 10, 15)


def make_pack(pack, steps, deadlines=None):
    """Replace the fixture pack's steps (and deadlines) with tiny made-up ones.

    steps: list of (step_id, depends_on, deadline_ids)
    deadlines: {deadline_id: "YYYY-MM-DD" or None}
    """
    pack["deadlines"] = [
        {"id": dl_id, "label": dl_id, "date": day, "kind": "hard" if day else "varies"}
        for dl_id, day in (deadlines or {}).items()
    ]
    pack["steps"] = [
        {"id": sid, "title": sid, "applies_if": {"always": True}, "depends_on": deps,
         "documents": [], "deadlines": dls, "plain_explanation": "x"}
        for sid, deps, dls in steps
    ]
    return pack


def all_yes(pack):
    return {s["id"]: "yes" for s in pack["steps"]}


# --- dependencies ---------------------------------------------------------------

def test_steps_come_after_their_dependencies(pack):
    make_pack(pack, [("c", ["b"], []), ("b", ["a"], []), ("a", [], [])])
    assert order_steps(pack, all_yes(pack), TODAY) == ["a", "b", "c"]


def test_no_deadlines_keeps_pack_order(pack):
    make_pack(pack, [("x", [], []), ("y", [], []), ("z", [], [])])
    assert order_steps(pack, all_yes(pack), TODAY) == ["x", "y", "z"]


def test_dependency_on_a_step_not_in_the_plan_is_ignored(pack):
    # "either/or": b depends on fafsa OR cadaa, only one applies
    make_pack(pack, [("fafsa", [], []), ("cadaa", [], []), ("b", ["fafsa", "cadaa"], [])])
    matched = {"cadaa": "yes", "b": "yes"}
    assert order_steps(pack, matched, TODAY) == ["cadaa", "b"]


def test_only_matched_steps_are_returned_once_each(pack):
    make_pack(pack, [("a", [], []), ("b", ["a"], []), ("c", [], [])])
    result = order_steps(pack, {"a": "yes", "b": "unknown"}, TODAY)
    assert result == ["a", "b"]


def test_empty_plan(pack):
    make_pack(pack, [("a", [], [])])
    assert order_steps(pack, {}, TODAY) == []


def test_unknown_steps_are_ordered_like_yes_steps(pack):
    make_pack(pack, [("a", [], []), ("b", [], ["soon"])], {"soon": "2026-11-01"})
    assert order_steps(pack, {"a": "yes", "b": "unknown"}, TODAY) == ["b", "a"]


# --- deadlines break ties ---------------------------------------------------------

def test_earlier_deadline_goes_first(pack):
    make_pack(pack, [("late", [], ["d2"]), ("early", [], ["d1"])],
              {"d1": "2026-11-01", "d2": "2027-03-02"})
    assert order_steps(pack, all_yes(pack), TODAY) == ["early", "late"]


def test_dated_steps_go_before_undated(pack):
    make_pack(pack, [("free", [], []), ("dated", [], ["d1"])], {"d1": "2027-03-02"})
    assert order_steps(pack, all_yes(pack), TODAY) == ["dated", "free"]


def test_step_inherits_deadline_from_steps_that_depend_on_it(pack):
    # "prep" has no deadline itself, but "submit" (which needs it) does.
    make_pack(pack, [
        ("other", [], ["d2"]),
        ("prep", [], []),
        ("submit", ["prep"], ["d1"]),
    ], {"d1": "2026-11-01", "d2": "2027-01-15"})
    assert order_steps(pack, all_yes(pack), TODAY) == ["prep", "submit", "other"]


def test_deadline_is_inherited_through_several_levels(pack):
    make_pack(pack, [
        ("other", [], ["d2"]),
        ("a", [], []),
        ("b", ["a"], []),
        ("c", ["b"], ["d1"]),
    ], {"d1": "2026-11-01", "d2": "2027-01-15"})
    eff = effective_deadlines(pack, all_yes(pack), TODAY)
    assert eff["a"] == eff["b"] == eff["c"] == datetime.date(2026, 11, 1)
    assert order_steps(pack, all_yes(pack), TODAY) == ["a", "b", "c", "other"]


def test_inherits_the_earliest_of_several(pack):
    make_pack(pack, [("prep", [], ["d3"]), ("x", ["prep"], ["d2"]), ("y", ["prep"], ["d1"])],
              {"d1": "2026-11-01", "d2": "2027-01-15", "d3": "2027-06-01"})
    assert effective_deadlines(pack, all_yes(pack), TODAY)["prep"] == datetime.date(2026, 11, 1)


def test_deadline_not_inherited_from_steps_outside_the_plan(pack):
    make_pack(pack, [("prep", [], []), ("submit", ["prep"], ["d1"])], {"d1": "2026-11-01"})
    assert effective_deadlines(pack, {"prep": "yes"}, TODAY) == {"prep": None}


def test_passed_deadlines_do_not_count(pack):
    make_pack(pack, [("a", [], []), ("b", [], ["old"])], {"old": "2026-10-01"})
    assert effective_deadlines(pack, all_yes(pack), TODAY)["b"] is None
    assert order_steps(pack, all_yes(pack), TODAY) == ["a", "b"]


def test_deadline_today_still_counts(pack):
    make_pack(pack, [("a", [], []), ("b", [], ["now"])], {"now": TODAY.isoformat()})
    assert order_steps(pack, all_yes(pack), TODAY) == ["b", "a"]


def test_undated_deadlines_do_not_count(pack):
    make_pack(pack, [("a", [], []), ("b", [], ["college"])], {"college": None})
    assert effective_deadlines(pack, all_yes(pack), TODAY)["b"] is None
    assert order_steps(pack, all_yes(pack), TODAY) == ["a", "b"]


def test_ready_steps_are_chosen_again_after_each_pick(pack):
    # After "a" finishes, "urgent" becomes ready and must jump ahead of "slow".
    make_pack(pack, [
        ("a", [], ["d2"]),
        ("slow", [], ["d3"]),
        ("urgent", ["a"], ["d1"]),
    ], {"d1": "2026-11-01", "d2": "2026-12-01", "d3": "2027-01-01"})
    assert order_steps(pack, all_yes(pack), TODAY) == ["a", "urgent", "slow"]
