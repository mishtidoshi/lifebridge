"""Tests for engine/understand.py, LifeBridge's own rule-based reader.

Small made-up packs check each reading rule; the real pack checks that its
example sentences come out right.
"""

import json
from pathlib import Path

import pytest

from engine.pack_loader import load_all_packs
from engine.understand import MAX_INPUT_CHARS, find_phrase, normalize, read_fact, understand

ROOT = Path(__file__).resolve().parents[2]
PACKS = load_all_packs(ROOT / "packs")


def words(text):
    return normalize(text).split()


@pytest.fixture
def reader_pack(pack):
    """The test pack with signals added."""
    color, pet, places = pack["facts"]
    color["options"][0]["signals"] = ["red", "crimson"]
    color["options"][1]["signals"] = ["blue"]
    color["ignore_if_after"] = ["mom", "dad"]
    pet["signals_yes"] = ["have a dog", "my cat"]
    pet["signals_no"] = ["no pets"]
    places["options"][0]["signals"] = ["at home"]
    places["options"][1]["signals"] = ["at school", "high school"]
    pack["routing_signals"] = ["sample", "colors"]
    return pack


def read(pack, fact_id, text):
    fact = next(f for f in pack["facts"] if f["id"] == fact_id)
    return read_fact(fact, words(text))[0]


# --- normalizing and finding phrases -------------------------------------------

def test_normalize():
    assert normalize("I'm a U.S. Citizen,  Self-Employed!") == "i'm a us citizen | self employed |"
    assert normalize("doesn’t") == "doesn't"  # curly apostrophe from phones


def test_not_does_not_reach_past_a_comma_or_but(reader_pack):
    assert read(reader_pack, "color", "Not my mom's, but blue") == "blue"


def test_find_phrase_matches_whole_words_only():
    assert find_phrase(words("I applied to the UC"), ["uc"]) == [4]
    assert find_phrase(words("I'm lucky"), ["uc"]) == []
    assert find_phrase(words("san jose state and sjsu"), ["san", "jose", "state"]) == [0]


# --- one fact ---------------------------------------------------------------

def test_enum_one_match(reader_pack):
    assert read(reader_pack, "color", "My favorite is crimson.") == "red"


def test_enum_two_different_answers_stays_unknown(reader_pack):
    assert read(reader_pack, "color", "red or blue, I can't decide") is None


def test_enum_negated_phrase_is_skipped(reader_pack):
    assert read(reader_pack, "color", "It's not red, it's blue") == "blue"


def test_phrase_about_a_parent_is_skipped(reader_pack):
    assert read(reader_pack, "color", "My mom likes red") is None
    assert read(reader_pack, "color", "My mom likes red but I like blue") == "blue"


def test_bool_yes_and_no(reader_pack):
    assert read(reader_pack, "has_pet", "We have a dog") is True
    assert read(reader_pack, "has_pet", "No pets here") is False
    assert read(reader_pack, "has_pet", "Nothing about animals") is None


def test_bool_negated_yes_means_no(reader_pack):
    assert read(reader_pack, "has_pet", "We don't have a dog") is False


def test_bool_conflict_stays_unknown(reader_pack):
    assert read(reader_pack, "has_pet", "No pets, but my cat is great") is None


def test_multi_collects_every_answer(reader_pack):
    assert read(reader_pack, "places", "I study at home and at school") == ["home", "school"]
    assert read(reader_pack, "places", "Nowhere in particular") is None


# --- understand() --------------------------------------------------------------

def test_understand_returns_facts_and_evidence(reader_pack):
    result = understand("Sample: I like crimson and we don't have a dog", {"sample": reader_pack})
    assert result["pack_id"] == "sample"
    assert result["facts"] == {"color": "red", "has_pet": False}
    assert result["evidence"] == {"color": ["crimson"], "has_pet": ["not have a dog"]}


def test_no_pack_matches():
    result = understand("My car broke down", PACKS)
    assert result["pack_id"] is None and result["facts"] == {} and result["evidence"] == {}


def test_given_pack_id_skips_routing():
    result = understand("I'm a senior", PACKS, pack_id="financial_aid")
    assert result["pack_id"] == "financial_aid" and result["facts"] == {"grade_level": "hs_senior"}


@pytest.mark.parametrize("text", ["", "   ", "x" * (MAX_INPUT_CHARS + 1)])
def test_bad_input(text):
    with pytest.raises(ValueError):
        understand(text, PACKS)


# --- the real Financial Aid pack --------------------------------------------------

def test_demo_sentence():
    result = understand(
        "I'm a senior in San José, my parents are self-employed, and I'm applying to UCs and CSUs.", PACKS)
    assert result["pack_id"] == "financial_aid"
    assert result["facts"] == {"state": "ca", "grade_level": "hs_senior", "parent_self_employed": True, "college_types": ["public_4yr"]}


@pytest.mark.parametrize("text", PACKS["financial_aid"]["example_inputs"])
def test_example_inputs_route_to_the_pack(text):
    assert understand(text, PACKS)["pack_id"] == "financial_aid"


@pytest.mark.parametrize("text, expected", [
    ("I'm undocumented and want to go to community college", {"citizenship_status": "undocumented_or_daca"}),
    ("My mom doesn't have a Social Security number", {"parent_ssn": "some_or_none"}),
    ("My parents are undocumented but I'm a U.S. citizen", {"citizenship_status": "us_citizen"}),
    ("I'm not a citizen, I have a green card", {"citizenship_status": "eligible_noncitizen"}),
    ("My parents aren't self-employed", {"parent_self_employed": False}),
    ("I already submitted my FAFSA", {"application_status": "submitted"}),
    ("I haven't started the FAFSA", {"application_status": "not_started"}),
    ("I'm in foster care", {"dependency_status": "independent"}),
])
def test_hard_cases(text, expected):
    facts = understand(text, PACKS, pack_id="financial_aid")["facts"]
    for fact_id, value in expected.items():
        assert facts.get(fact_id) == value, facts


@pytest.mark.parametrize("text, state", [
    ("I'm a senior in Texas", "tx"),
    ("We live in West Virginia", "wv"),        # not also read as Virginia
    ("We live in Virginia", "va"),
    ("I go to school in Washington DC", "dc"),
    ("Washington state resident here", "wa"),
    ("I'm from Brooklyn", "ny"),
])
def test_state_is_read(text, state):
    assert understand(text, PACKS, pack_id="financial_aid")["facts"].get("state") == state


def test_parent_status_does_not_become_the_students():
    facts = understand("My dad is undocumented", PACKS, pack_id="financial_aid")["facts"]
    assert "citizenship_status" not in facts


SCENARIOS = sorted((ROOT / "tests" / "scenarios").glob("*/*.json"))


@pytest.mark.parametrize("path", SCENARIOS, ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_scenario_text_never_contradicts_its_facts(path):
    """What the reader finds in a scenario's sentence must agree with the facts a person wrote for it."""
    scenario = json.loads(path.read_text(encoding="utf-8"))
    found = understand(scenario["input_text"], PACKS, pack_id=path.parent.name)["facts"]
    for fact_id, value in found.items():
        if fact_id in scenario["facts"]:
            assert scenario["facts"][fact_id] == value, f"{fact_id}: read {value!r}, scenario says {scenario['facts'][fact_id]!r}"
