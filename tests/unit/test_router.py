"""Topic routing: rules first, then the naive Bayes model (engine/classifier.py).

The accuracy test uses hand-written descriptions in tests/routing/cases.json, kept
separate from the packs' training text, so it measures how well routing works on
new wording. Run `pytest -s tests/unit/test_router.py` to see the score.
"""

import json
from pathlib import Path

import pytest

from engine.classifier import TopicModel, tokens
from engine.pack_loader import load_all_packs
from engine.understand import route, understand

ROOT = Path(__file__).resolve().parents[2]
PACKS = load_all_packs(ROOT / "packs")
CASES = json.loads((ROOT / "tests/routing/cases.json").read_text())["cases"]
MIN_ACCURACY = 0.9


def test_tokens_drop_stopwords_and_add_pairs():
    assert tokens("I lost my Medi-Cal") == ["lost", "medi", "cal", "lost medi", "medi cal"]


def test_probabilities_add_up_to_one():
    probs = TopicModel(PACKS).probabilities("wildfire smoke near our home")
    assert set(probs) == set(PACKS)
    assert abs(sum(probs.values()) - 1) < 1e-9
    assert max(probs, key=probs.get) == "disaster"


def test_unknown_words_give_no_guess():
    assert TopicModel(PACKS).predict("zzz qqq") == (None, 0.0)


def test_one_weak_word_is_not_enough():
    assert route("My car broke down", PACKS)["pack_id"] is None


def test_routing_says_how_it_decided():
    r = route("I need help with the FAFSA", PACKS)
    assert r["pack_id"] == "financial_aid" and r["method"] == "rules" and "fafsa" in r["top_words"]
    r = route("We got a letter that our coverage ends next month", PACKS)
    assert r["pack_id"] == "medicaid" and r["method"] == "model" and r["confidence"] >= 0.75


@pytest.mark.parametrize("pack_id", sorted(PACKS))
def test_each_pack_routes_its_own_examples(pack_id):
    for text in PACKS[pack_id]["example_inputs"]:
        assert understand(text, PACKS)["pack_id"] == pack_id, text


def test_never_guesses_a_topic_for_off_topic_text():
    for case in CASES:
        if case["expected"] is None:
            assert understand(case["text"], PACKS)["pack_id"] is None, case["text"]


def test_routing_accuracy():
    right = [understand(c["text"], PACKS)["pack_id"] == c["expected"] for c in CASES]
    accuracy = sum(right) / len(right)
    print(f"\nRouting accuracy: {sum(right)}/{len(right)} = {accuracy:.0%}")
    assert accuracy >= MIN_ACCURACY
