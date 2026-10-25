"""Make labeled training sentences for a pack, using only the pack's own phrases.

Each sentence mixes a few phrases (answers to different questions), sometimes with:
    typos             "senoir", "self emplyed"   → the model learns to read past misspellings
    negations         "not self employed"        → bool facts flip; other facts stay unknown
    parent sentences  "my mom is undocumented"   → about the parent, so the student's fact stays unknown
    filler            "hi", "please help"        → words that mean nothing
and is labeled with the right answer for every question (or NONE when the sentence doesn't say).
The real descriptions in tests/ are never used for training, so the tests measure new text.
"""

import random

from engine.facts import text as as_text
from engine.understand import find_phrase, normalize, phrase_words

NONE = "__none__"
FILLERS = ["", "", "", "hi", "so", "please help", "i need help", "what do i do", "thanks", "um", "ok so", "can you help"]
JOINERS = [", ", " and ", ". ", " also ", ", and ", " "]
NEGATIONS = ["not", "don't", "aren't", "isn't", "never"]
PARENTS = ["my mom", "my dad", "my parents", "my mother", "my father"]
SIGNALS_PER_OPTION = 4  # at most this many phrases per answer
REPEATS = 8  # sentences per phrase


def typo(word, rng):
    """One small spelling mistake: swap two letters, drop one, or double one."""
    if len(word) < 4:
        return word
    i = rng.randrange(1, len(word) - 1)
    kind = rng.randrange(3)
    if kind == 0:
        return word[:i] + word[i + 1] + word[i] + word[i + 2:]
    if kind == 1:
        return word[:i] + word[i + 1:]
    return word[:i] + word[i] + word[i:]


def noisy(phrase, rng, p=0.3):
    words = phrase.split()
    if rng.random() < p:
        j = rng.randrange(len(words))
        words[j] = typo(words[j], rng)
    return " ".join(words)


def phrase_bank(pack):
    """fact id → list of (phrase, value) the pack says mean that answer."""
    bank = {}
    for fact in pack["facts"]:
        items = []
        if fact["type"] in ("enum", "multi"):
            for option in fact.get("options", []):
                for phrase in option.get("signals", [])[:SIGNALS_PER_OPTION]:
                    items.append((phrase, option["value"]))
        elif fact["type"] == "bool":
            items += [(p, True) for p in fact.get("signals_yes", [])[:SIGNALS_PER_OPTION]]
            items += [(p, False) for p in fact.get("signals_no", [])[:SIGNALS_PER_OPTION]]
        if items:
            bank[fact["id"]] = items
    return bank


def _mentions_answer(text, phrases):
    words = normalize(text).split()
    return any(find_phrase(words, phrase_words(p)) for p in phrases)


def _sentence(parts, rng):
    out = rng.choice(FILLERS)
    for part in parts:
        out = (out + rng.choice(JOINERS) + part) if out else part
    return out


def examples(pack, seed=11):
    """[(text, {fact_id: value | [values] | NONE})] for every fact that has phrases."""
    rng = random.Random(seed)
    bank = phrase_bank(pack)
    facts = {f["id"]: f for f in pack["facts"] if f["id"] in bank}
    answer_phrases = {ph for items in bank.values() for ph, _ in items}
    # Neutral topic text: routing phrases and step titles ("Create StudentAid.gov accounts for the student and
    # parent(s)"). They use everyday topic words like "parents" and "college" without answering a question,
    # so the model learns those words alone aren't an answer. Anything containing an answer phrase is skipped.
    titles = [as_text(st["title"]).lower() for st in pack["steps"]]
    context = [
        ph for ph in pack.get("routing_signals", []) + titles
        if ph not in answer_phrases and not _mentions_answer(ph, answer_phrases)
    ]
    out = []

    def make(main_fact, phrase, value):
        labels = {fid: ([] if facts[fid]["type"] == "multi" else NONE) for fid in facts}
        parts = []

        def put(fid, ph, val):
            ph = noisy(ph, rng)
            if facts[fid]["type"] == "multi":
                if val not in labels[fid]:
                    labels[fid].append(val)
            else:
                labels[fid] = val
            parts.append(ph)

        put(main_fact, phrase, value)
        # a few other answers, so the model learns which words belong to which question
        others = [f for f in facts if f != main_fact]
        for fid in rng.sample(others, k=min(len(others), rng.randrange(0, 3))):
            if facts[fid]["type"] != "multi" and labels[fid] != NONE:
                continue
            ph, val = rng.choice(bank[fid])
            put(fid, ph, val)
        # a negated phrase: flips a yes/no answer, says nothing for the other kinds
        if others and rng.random() < 0.3:
            fid = rng.choice(others)
            ph, val = rng.choice(bank[fid])
            if facts[fid]["type"] == "bool" and labels[fid] == NONE:
                labels[fid] = not val
                parts.append(f"{rng.choice(NEGATIONS)} {noisy(ph, rng)}")
            elif facts[fid]["type"] == "enum" and labels[fid] == NONE:
                parts.append(f"{rng.choice(NEGATIONS)} {noisy(ph, rng)}")
            elif facts[fid]["type"] == "multi" and val not in labels[fid]:
                parts.append(f"{rng.choice(NEGATIONS)} {noisy(ph, rng)}")  # "not pregnant": that option stays off
        # a sentence about a parent: says nothing about facts that skip parent words
        parent_facts = [f for f in others if facts[f].get("ignore_if_after") and labels[f] == NONE]
        if parent_facts and rng.random() < 0.3:
            fid = rng.choice(parent_facts)
            ph, _ = rng.choice(bank[fid])
            parts.append(f"{rng.choice(PARENTS)} is {noisy(ph, rng)}")
        # topic words ("medicaid", "fafsa", "wildfire") that answer no question, so they aren't mistaken for one
        if context and rng.random() < 0.6:
            parts.append(noisy(rng.choice(context), rng))
        rng.shuffle(parts)
        return _sentence(parts, rng), labels

    for fid, items in bank.items():
        n_answers = len({value for _, value in items})
        # questions with many answers (like the state) get more sentences per phrase, so every answer is seen enough
        repeats = REPEATS * (2 if n_answers > 10 else 1)
        for phrase, value in items:
            for _ in range(repeats):
                out.append(make(fid, phrase, value))
    # sentences with nothing to read, so "no answer" is learned too
    for _ in range(len(out) // 10):
        labels = {fid: ([] if facts[fid]["type"] == "multi" else NONE) for fid in facts}
        out.append((_sentence([rng.choice(FILLERS) or "help", as_text(pack["title"]).lower()], rng), labels))
    return out
