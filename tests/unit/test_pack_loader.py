"""Tests for engine.pack_loader — one test per rule in packs/SCHEMA.md §8."""

import json

import pytest

from engine.pack_loader import PackError, load_all_packs, load_pack, validate_pack


def errors(pack, today):
    return validate_pack(pack, today=today).errors


def warnings(pack, today):
    return validate_pack(pack, today=today).warnings


def step(pack, step_id):
    return next(s for s in pack["steps"] if s["id"] == step_id)


def assert_one_error(pack, today, *words):
    """Exactly one error, and it mentions every given word (so messages stay helpful)."""
    errs = errors(pack, today)
    assert len(errs) == 1, errs
    for word in words:
        assert word in errs[0], errs[0]


# --- The baseline ----------------------------------------------------------

def test_minimal_pack_is_valid(pack, today):
    result = validate_pack(pack, today=today)
    assert result.errors == []
    assert result.warnings == []


# --- Top level --------------------------------------------------------------

@pytest.mark.parametrize("field", [
    "schema_version", "id", "title", "summary", "status", "region",
    "routing_hint", "example_inputs", "facts", "documents", "deadlines", "steps",
])
def test_missing_top_level_field(pack, today, field):
    del pack[field]
    assert any(field in e for e in errors(pack, today))


def test_unsupported_schema_version(pack, today):
    pack["schema_version"] = 2
    assert_one_error(pack, today, "schema_version")


def test_bad_status(pack, today):
    pack["status"] = "done"
    assert_one_error(pack, today, "status")


def test_text_fields_accept_translations(pack, today):
    pack["title"] = {"en": "Sample", "es": "Ejemplo"}
    step(pack, "first")["plain_explanation"] = {"en": "Do it.", "es": "Hazlo."}
    assert errors(pack, today) == []


def test_translated_text_needs_english(pack, today):
    pack["title"] = {"es": "Ejemplo"}
    assert_one_error(pack, today, "title")


def test_empty_example_inputs(pack, today):
    pack["example_inputs"] = []
    assert_one_error(pack, today, "example_inputs")


# --- Ids --------------------------------------------------------------------

@pytest.mark.parametrize("section", ["facts", "documents", "deadlines", "steps"])
def test_duplicate_ids(pack, today, section):
    pack[section].append(dict(pack[section][0]))
    assert any("duplicate" in e for e in errors(pack, today))


def test_id_must_be_snake_case(pack, today):
    step(pack, "first")["id"] = "First Step"
    step(pack, "second")["depends_on"] = ["First Step"]
    assert_one_error(pack, today, "First Step")


# --- Facts ------------------------------------------------------------------

def test_bad_fact_type(pack, today):
    pack["facts"][0]["type"] = "number"
    assert any("type" in e for e in errors(pack, today))


def test_enum_fact_needs_options(pack, today):
    del pack["facts"][0]["options"]
    assert any("options" in e for e in errors(pack, today))


# --- Rules ------------------------------------------------------------------

def test_rule_unknown_fact(pack, today):
    step(pack, "second")["applies_if"] = {"fact": "shape", "eq": "round"}
    assert_one_error(pack, today, "second", "shape")


def test_rule_value_not_in_options(pack, today):
    step(pack, "second")["applies_if"] = {"fact": "color", "eq": "green"}
    assert_one_error(pack, today, "second", "green")


def test_rule_in_checks_every_value(pack, today):
    step(pack, "second")["applies_if"] = {"fact": "color", "in": ["red", "purple"]}
    assert_one_error(pack, today, "purple")


def test_rule_bool_fact_needs_bool_value(pack, today):
    step(pack, "second")["applies_if"] = {"fact": "has_pet", "eq": "yes"}
    assert_one_error(pack, today, "has_pet")


def test_rule_has_only_for_multi_facts(pack, today):
    step(pack, "second")["applies_if"] = {"fact": "color", "has": "red"}
    assert_one_error(pack, today, "has", "color")


def test_rule_nested_all_any_not(pack, today):
    step(pack, "second")["applies_if"] = {"all": [
        {"fact": "color", "in": ["red", "blue"]},
        {"any": [{"fact": "has_pet", "eq": True}, {"not": {"fact": "places", "has": "school"}}]},
    ]}
    assert errors(pack, today) == []


def test_rule_nested_error_is_found(pack, today):
    step(pack, "second")["applies_if"] = {"all": [{"any": [{"fact": "places", "has_any": ["moon"]}]}]}
    assert_one_error(pack, today, "moon")


@pytest.mark.parametrize("bad_rule", [
    {},
    {"fact": "color"},                        # no operator
    {"fact": "color", "eq": "red", "in": ["red"]},  # two operators
    {"all": []},                              # empty list
    {"all": {"fact": "color", "eq": "red"}},  # not a list
    {"always": False},                        # only `true` is allowed
    "always",
])
def test_malformed_rules(pack, today, bad_rule):
    step(pack, "second")["applies_if"] = bad_rule
    assert any("second" in e for e in errors(pack, today))


def test_document_rule_is_checked_too(pack, today):
    pack["documents"][0]["applies_if"] = {"fact": "shape", "eq": "round"}
    assert_one_error(pack, today, "id_card", "shape")


# --- References -------------------------------------------------------------

def test_unknown_dependency(pack, today):
    step(pack, "second")["depends_on"] = ["zeroth"]
    assert_one_error(pack, today, "second", "zeroth")


def test_unknown_document(pack, today):
    step(pack, "first")["documents"] = ["passport"]
    assert any("passport" in e for e in errors(pack, today))


def test_unknown_deadline(pack, today):
    step(pack, "second")["deadlines"] = ["tiny_day"]
    assert any("tiny_day" in e for e in errors(pack, today))


def test_step_cannot_depend_on_itself(pack, today):
    step(pack, "first")["depends_on"] = ["first"]
    assert any("cycle" in e for e in errors(pack, today))


def test_dependency_cycle(pack, today):
    step(pack, "first")["depends_on"] = ["second"]
    errs = errors(pack, today)
    assert len(errs) == 1 and "cycle" in errs[0]
    assert "first" in errs[0] and "second" in errs[0]


# --- Deadlines --------------------------------------------------------------

def test_bad_deadline_kind(pack, today):
    pack["deadlines"][0]["kind"] = "soonish"
    assert_one_error(pack, today, "kind")


def test_bad_date_format(pack, today):
    pack["deadlines"][0]["date"] = "03/02/2027"
    assert_one_error(pack, today, "big_day", "date")


def test_hard_deadline_needs_a_date(pack, today):
    pack["deadlines"][0]["date"] = None
    assert_one_error(pack, today, "big_day", "date")


def test_varies_deadline_has_no_date(pack, today):
    pack["deadlines"][0]["kind"] = "varies"
    assert_one_error(pack, today, "big_day", "date")


def test_from_letter_deadline_without_date_is_fine(pack, today):
    pack["deadlines"][0].update(kind="from_letter", date=None, source_url=None, last_verified=None)
    assert errors(pack, today) == []


# --- Sources: draft = warning, verified = error -------------------------------

@pytest.mark.parametrize("field", ["source_text", "source_url", "last_verified"])
def test_missing_source_is_warning_in_draft(pack, today, field):
    step(pack, "first")[field] = "" if field == "source_text" else None
    result = validate_pack(pack, today=today)
    assert result.errors == []
    assert any(field in w and "first" in w for w in result.warnings)


@pytest.mark.parametrize("field", ["source_text", "source_url", "last_verified"])
def test_missing_source_is_error_when_verified(pack, today, field):
    pack["status"] = "verified"
    step(pack, "first")[field] = "" if field == "source_text" else None
    assert_one_error(pack, today, "first", field)


def test_dated_deadline_needs_source_when_verified(pack, today):
    pack["status"] = "verified"
    pack["deadlines"][0]["last_verified"] = None
    assert_one_error(pack, today, "big_day", "last_verified")


def test_bad_last_verified_date(pack, today):
    step(pack, "first")["last_verified"] = "last week"
    assert_one_error(pack, today, "first", "last_verified")


def test_old_last_verified_is_warning(pack, today):
    step(pack, "first")["last_verified"] = "2026-07-01"  # 95 days before TODAY
    result = validate_pack(pack, today=today)
    assert result.errors == []
    assert any("first" in w and "60 days" in w for w in result.warnings)


def test_last_verified_exactly_60_days_is_fine(pack, today):
    step(pack, "first")["last_verified"] = "2026-08-05"
    assert warnings(pack, today) == []


# --- Unused items -----------------------------------------------------------

def test_unused_document_is_warning(pack, today):
    step(pack, "first")["documents"] = []
    result = validate_pack(pack, today=today)
    assert result.errors == []
    assert any("id_card" in w for w in result.warnings)


def test_unused_deadline_is_warning(pack, today):
    step(pack, "second")["deadlines"] = []
    result = validate_pack(pack, today=today)
    assert result.errors == []
    assert any("big_day" in w for w in result.warnings)


# --- Several problems at once -----------------------------------------------

def test_reports_all_problems_not_just_the_first(pack, today):
    pack["status"] = "done"
    step(pack, "second")["depends_on"] = ["zeroth"]
    pack["deadlines"][0]["kind"] = "soonish"
    assert len(errors(pack, today)) == 3


def test_broken_structure_does_not_crash(pack, today):
    pack["steps"] = "not a list"
    pack["facts"] = [42]
    assert errors(pack, today)  # reported as errors, no exception


# --- Loading files ------------------------------------------------------------

def test_load_pack_returns_valid_pack(tmp_path, pack, today):
    path = tmp_path / "sample.json"
    path.write_text(json.dumps(pack))
    assert load_pack(path, today=today)["id"] == "sample"


def test_load_pack_raises_with_all_errors(tmp_path, pack, today):
    pack["status"] = "done"
    step(pack, "second")["depends_on"] = ["zeroth"]
    path = tmp_path / "sample.json"
    path.write_text(json.dumps(pack))
    with pytest.raises(PackError) as exc:
        load_pack(path, today=today)
    assert "status" in str(exc.value) and "zeroth" in str(exc.value)


def test_load_pack_id_must_match_filename(tmp_path, pack, today):
    path = tmp_path / "other_name.json"
    path.write_text(json.dumps(pack))
    with pytest.raises(PackError, match="filename"):
        load_pack(path, today=today)


def test_load_pack_bad_json(tmp_path, today):
    path = tmp_path / "sample.json"
    path.write_text("{ not json")
    with pytest.raises(PackError, match="JSON"):
        load_pack(path, today=today)


def test_load_all_packs(tmp_path, pack, today):
    (tmp_path / "sample.json").write_text(json.dumps(pack))
    other = dict(pack, id="other")
    (tmp_path / "other.json").write_text(json.dumps(other))
    (tmp_path / "SCHEMA.md").write_text("not a pack")
    packs = load_all_packs(tmp_path, today=today)
    assert sorted(packs) == ["other", "sample"]


# --- Signals (phrases the rule-based reader looks for, SCHEMA.md §2a) ---------

def fact(pack, fact_id):
    return next(f for f in pack["facts"] if f["id"] == fact_id)


def test_signals_are_valid(pack, today):
    fact(pack, "color")["options"][0]["signals"] = ["red", "crimson"]
    fact(pack, "has_pet")["signals_yes"] = ["my dog"]
    fact(pack, "has_pet")["signals_no"] = ["no pets"]
    fact(pack, "color")["ignore_if_after"] = ["mom"]
    pack["routing_signals"] = ["sample"]
    assert errors(pack, today) == [] and warnings(pack, today) == []


@pytest.mark.parametrize("bad", ["red", [], [""], [3]])
def test_signals_must_be_a_list_of_phrases(pack, today, bad):
    fact(pack, "color")["options"][0]["signals"] = bad
    if bad == []:
        assert errors(pack, today) == []  # an empty list is allowed: no phrases yet
    else:
        assert_one_error(pack, today, "color", "signals")


def test_signals_yes_only_on_bool_facts(pack, today):
    fact(pack, "color")["signals_yes"] = ["red"]
    assert_one_error(pack, today, "color", "signals_yes", "bool")


def test_bad_routing_signals(pack, today):
    pack["routing_signals"] = "sample"
    assert_one_error(pack, today, "routing_signals")


def test_same_signal_on_two_answers_is_warning(pack, today):
    fact(pack, "color")["options"][0]["signals"] = ["bright"]
    fact(pack, "color")["options"][1]["signals"] = ["Bright!"]  # same phrase once punctuation is gone
    assert errors(pack, today) == []
    assert any("bright" in w.lower() and "twice" in w for w in warnings(pack, today))


# --- Checks added for SCHEMA.md "Not checked yet" and §9 (trust fields) ----------

def test_cycle_dates(pack, today):
    pack["cycle"] = {"label": "2027–28", "starts": "2027-01-01", "ends": "2026-01-01"}
    assert_one_error(pack, today, "cycle", "starts")
    pack["cycle"] = {"label": "2027–28", "starts": "soon", "ends": "2028-01-01"}
    assert_one_error(pack, today, "cycle", "YYYY-MM-DD")


def test_cycle_outside_today_warns(pack, today):
    pack["cycle"] = {"label": "Old year", "starts": "2020-01-01", "ends": "2020-12-31"}
    assert errors(pack, today) == []
    assert any("outside the cycle" in w for w in warnings(pack, today))


def test_notice_needs_rule_and_message(pack, today):
    pack["notices"] = [{"id": "hello", "applies_if": {"always": True}}]
    assert_one_error(pack, today, "hello", "message")
    pack["notices"] = [{"id": "hello", "applies_if": {"fact": "nope", "eq": 1}, "message": "Hi"}]
    assert_one_error(pack, today, "hello", "nope")
    pack["notices"] = [{"id": "hello", "applies_if": {"always": True}, "message": "Hi", "stop_plan": "yes"}]
    assert_one_error(pack, today, "stop_plan")


def test_done_if_is_checked(pack, today):
    step(pack, "first")["done_if"] = {"fact": "color", "eq": "purple"}
    assert_one_error(pack, today, "first", "purple")


def test_from_fact_must_be_a_date_fact(pack, today):
    pack["deadlines"].append({"id": "letter_day", "label": "Letter", "date": None, "kind": "from_letter",
                              "from_fact": "color", "offset_days": 30})
    step(pack, "first")["deadlines"].append("letter_day")
    assert_one_error(pack, today, "letter_day", "date")


def test_offset_and_repeat_must_be_positive(pack, today):
    dl = next(d for d in pack["deadlines"] if d["id"] == "big_day")
    dl["repeat_months"] = 0
    assert_one_error(pack, today, "big_day", "repeat_months")


def test_verified_pack_needs_reviewed_steps(pack, today):
    pack["status"] = "verified"
    step(pack, "first")["review_status"] = "draft"
    assert_one_error(pack, today, "first", "checked by a person")


def test_verified_step_needs_initials(pack, today):
    step(pack, "first")["verified_by"] = None
    assert_one_error(pack, today, "first", "verified_by")


def test_help_options(pack, today):
    pack["help"] = [{"id": "office", "title": "Call the office", "text": "They can help.",
                     "source_url": "https://example.gov/help", "prepare": ["Your letter"]}]
    step(pack, "first")["help"] = ["office"]
    assert errors(pack, today) == []
    step(pack, "second")["help"] = ["nowhere"]
    assert_one_error(pack, today, "second", "nowhere")


def test_why_it_matters_needs_a_source_in_verified_packs(pack, today):
    pack["status"] = "verified"
    pack["why_it_matters"] = {"text": "Grants don't have to be paid back."}
    assert_one_error(pack, today, "why_it_matters", "source")
