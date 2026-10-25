"""Tests for LifeBridge's machine-learning reader (engine/ml/).

The scoring tests compare rules alone with rules + model on descriptions the model never saw
(tests/extraction/). Run `pytest -s tests/unit/test_ml.py` to see the numbers.
"""

import json
from pathlib import Path

import pytest

from engine.ml.fact_model import PackModels, fingerprint
from engine.ml.features import featurize, tokens
from engine.ml.softmax import SoftmaxRegression
from engine.pack_loader import load_all_packs
from engine.understand import understand

ROOT = Path(__file__).resolve().parents[2]
PACKS = load_all_packs(ROOT / "packs")


def score(file, use_model):
    cases = json.loads((ROOT / "tests/extraction" / file).read_text())["cases"]
    correct = missed = wrong = 0
    for case in cases:
        got = understand(case["text"], PACKS, pack_id=case["pack"], use_model=use_model)["facts"]
        for fact_id in set(case["expected"]) | set(got):
            if fact_id in case["expected"] and got.get(fact_id) == case["expected"][fact_id]:
                correct += 1
            elif fact_id in case["expected"] and fact_id not in got:
                missed += 1
            else:
                wrong += 1
    return correct, missed, wrong


# --- the pieces ----------------------------------------------------------------------

def test_softmax_learns_a_simple_pattern():
    data = [({"w=red": 1.0, "__bias__": 1.0}, "red"), ({"w=blue": 1.0, "__bias__": 1.0}, "blue")] * 20
    model = SoftmaxRegression(["red", "blue"], epochs=10).fit(data)
    assert model.predict_proba({"w=red": 1.0, "__bias__": 1.0})["red"] > 0.9


def test_softmax_saves_and_loads():
    data = [({"w=a": 1.0}, "x"), ({"w=b": 1.0}, "y")] * 10
    model = SoftmaxRegression(["x", "y"]).fit(data)
    again = SoftmaxRegression.from_json(model.to_json(min_weight=0))
    assert again.predict_proba({"w=a": 1.0}) == pytest.approx(model.predict_proba({"w=a": 1.0}), abs=0.01)


def test_negation_and_parent_markers():
    assert tokens("my mom isn't self-employed") == ["my", "mom", "NOT_PAR_self", "NOT_PAR_employed"]
    assert tokens("I'm not a citizen, but I'm a senior") == ["i'm", "NOT_a", "NOT_citizen", "i'm", "a", "senior"]


def test_letter_chunks_survive_typos():
    a, _ = featurize("senior")
    b, _ = featurize("senoir")
    shared = {k for k in a if k.startswith("c") and k in b}
    assert len(shared) >= 3  # "#se", "sen", "#sen" still match


def test_saved_models_match_the_packs():
    """If this fails, a pack changed: run `python tools/train_models.py`."""
    for pack in PACKS.values():
        assert PackModels.load(pack) is not None, f"models/{pack['id']}.json is missing or out of date"


def test_strict_questions_are_never_guessed():
    models = PackModels.load(PACKS["financial_aid"])
    assert "dependency_status" not in models.models  # "model": false in the pack


def test_training_works_from_the_pack_alone():
    models = PackModels.train(PACKS["disaster"], epochs=10)  # small pack, so this is quick
    assert models.fingerprint == fingerprint(PACKS["disaster"])
    guess = models.predict("our house got floded", threshold=0.5)
    assert guess["hazards"][0] == ["flood"]


# --- how it fits with the rules --------------------------------------------------------

def test_model_guesses_are_marked():
    result = understand("im a senoir in teksas", PACKS, pack_id="financial_aid")
    assert result["facts"]["grade_level"] == "hs_senior"
    assert "grade_level" in result["guessed"] and result["guessed"]["grade_level"] >= 0.97


def test_rules_come_first_and_model_can_be_off():
    result = understand("I'm a senior in Ohio", PACKS, pack_id="financial_aid")
    assert result["facts"]["grade_level"] == "hs_senior" and "grade_level" not in result["guessed"]
    off = understand("im a senoir in teksas", PACKS, pack_id="financial_aid", use_model=False)
    assert off["guessed"] == {} and "grade_level" not in off["facts"]


# --- measured: rules alone vs rules + model on text the model never saw ------------------

def test_model_reads_misspellings_without_adding_mistakes():
    rules = score("typos.json", use_model=False)
    both = score("typos.json", use_model=True)
    print(f"\nTypos (30 descriptions)  rules only: {rules[0]} correct, {rules[1]} missed, {rules[2]} wrong")
    print(f"                         rules + model: {both[0]} correct, {both[1]} missed, {both[2]} wrong")
    assert both[0] >= rules[0] + 8  # reads many more answers
    assert both[2] <= rules[2]  # without more wrong ones


def test_model_adds_no_mistakes_on_clean_text():
    rules = score("cases.json", use_model=False)
    both = score("cases.json", use_model=True)
    print(f"\nClean text (36 descriptions)  rules only: {rules}  rules + model: {both}  (correct, missed, wrong)")
    assert both[2] <= rules[2] and both[0] >= rules[0]
