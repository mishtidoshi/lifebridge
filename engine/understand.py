"""Understand: turn what the user typed into facts the pack defines.

LifeBridge's own rule-based reader. No AI service is involved: the text never
leaves the LifeBridge server, and nothing is stored or logged.

Each pack lists "signals", short phrases that point to an answer
(SCHEMA.md §2a). For example, "senior" → grade_level = hs_senior. The reader:

1. normalizes the text (lowercase, no punctuation except clause breaks), so
   "Self-employed," and "self employed" look the same
2. finds every signal phrase as whole words ("uc" doesn't match inside "lucky")
3. skips a phrase that comes right after a negation ("I'm *not* a citizen"; for
   yes/no facts that flips the answer: "*aren't* self-employed" means no) or,
   for facts that ask for it, right after a parent word ("my *mom* is undocumented"
   is about the parent, not the student)
4. fills in a fact only when the matches agree. Two different answers for the same
   fact means it stays unknown: a blank is better than a wrong answer, and the user
   fills it in on the "Here's what I understood" screen.

It never decides the plan. Its facts go to the confirm screen first.
"""

import re

from engine.facts import clean_facts

MAX_INPUT_CHARS = 2000
LOOK_BACK_WORDS = 3  # how far before a phrase to look for "not" or a parent word

NEGATIONS = {
    "not", "no", "never", "non", "without", "neither", "nor",
    "don't", "dont", "doesn't", "doesnt", "didn't", "didnt", "isn't", "isnt", "aren't", "arent",
    "wasn't", "wasnt", "haven't", "havent", "hasn't", "hasnt", "can't", "cant", "won't", "wont",
}


BREAK = "|"  # marks a comma or sentence end, so "not" in one clause doesn't reach the next
CLAUSE_WORDS = {BREAK, "but", "though", "although", "however"}


def normalize(text):
    """Lowercase words with clause breaks: "I'm a U.S. citizen, self-employed!" → "i'm a us citizen | self employed |"."""
    text = text.lower().replace("’", "'")
    text = re.sub(r"\b(\w)\.", r"\1", text)  # periods after single letters: "u.s." → "us"
    text = re.sub(r"[.,;:!?]+", f" {BREAK} ", text)
    text = re.sub(r"[^\w'|]+", " ", text)  # anything else that isn't a letter, digit, _ or ' becomes a space
    return " ".join(text.split())


def phrase_words(phrase):
    """A signal phrase as a list of normalized words (no clause breaks)."""
    return [w for w in normalize(phrase).split() if w != BREAK]


def find_phrase(words, phrase_words):
    """Every position where phrase_words appears in words, as whole words."""
    n = len(phrase_words)
    return [i for i in range(len(words) - n + 1) if words[i:i + n] == phrase_words]


def _blocked(words, start, blockers):
    """True if one of `blockers` appears in the few words just before position `start`, in the same clause."""
    for w in reversed(words[max(0, start - LOOK_BACK_WORDS):start]):
        if w in CLAUSE_WORDS:
            return False
        if w in blockers:
            return True
    return False


def _hits(words, signals, ignore_after, negated=False):
    """The signal phrases found in the text, skipping ones about a parent if the fact says so.

    negated=False: phrases said plainly. negated=True: phrases right after "not", "aren't", ...
    """
    found = []
    for signal in signals:
        phrase = phrase_words(signal)
        for start in find_phrase(words, phrase):
            if _blocked(words, start, ignore_after) or _blocked(words, start, NEGATIONS) != negated:
                continue
            found.append(signal)
            break
    return sorted(found, key=len, reverse=True)  # most specific phrase first, for the evidence


def read_fact(fact, words):
    """(value, phrases that led to it) for one fact, or (None, []) if the text doesn't settle it."""
    ignore_after = set(fact.get("ignore_if_after", []))

    if fact["type"] == "bool":
        # "not self-employed" is a no; "not without a job" would be a yes.
        def flipped(signals):
            return [f"not {h}" for h in _hits(words, signals, ignore_after, negated=True)]

        yes = _hits(words, fact.get("signals_yes", []), ignore_after) + flipped(fact.get("signals_no", []))
        no = _hits(words, fact.get("signals_no", []), ignore_after) + flipped(fact.get("signals_yes", []))
        if yes and not no:
            return True, yes
        if no and not yes:
            return False, no
        return None, []

    if fact["type"] in ("enum", "multi"):
        matched = {}
        for option in fact.get("options", []):
            hits = _hits(words, option.get("signals", []), ignore_after)
            if hits:
                matched[option["value"]] = hits
        if fact["type"] == "multi":
            if not matched:
                return None, []
            return list(matched), [h for hits in matched.values() for h in hits]
        if len(matched) == 1:  # exactly one answer: use it. Zero or several: leave it unknown.
            (value, hits), = matched.items()
            return value, hits
    return None, []  # date facts: typed dates aren't read yet


def _shared_fact_ids(packs):
    """Facts every pack asks (like the state). They can't tell topics apart, so routing ignores them."""
    if len(packs) < 2:
        return set()
    ids = [{f["id"] for f in pack["facts"]} for pack in packs.values()]
    return set.intersection(*ids)


def rule_scores(words, packs):
    """{pack_id: (score, routing phrases found)}: 2 points per routing phrase, 1 per fact the text answers."""
    shared = _shared_fact_ids(packs)
    scores = {}
    for pack_id, pack in packs.items():
        phrases = _hits(words, pack.get("routing_signals", []), set())
        score = 2 * len(phrases)
        score += sum(1 for fact in pack["facts"] if fact["id"] not in shared and read_fact(fact, words)[0] is not None)
        scores[pack_id] = (score, phrases)
    return scores


_models = {}


def _model(packs):
    from engine.classifier import TopicModel  # here, not at the top: classifier.py uses normalize() from this file

    key = tuple(sorted((k, id(v)) for k, v in packs.items()))
    if key not in _models:
        _models.clear()
        _models[key] = TopicModel(packs)
    return _models[key]


def rules_conflict(fact, words):
    """True if the text gives two different answers to this fact ("I'm a senior. Actually I'm a junior.").
    The rules leave those blank on purpose, so the model mustn't fill them in either."""
    ignore_after = set(fact.get("ignore_if_after", []))
    if fact["type"] == "bool":
        yes = _hits(words, fact.get("signals_yes", []), ignore_after) or _hits(words, fact.get("signals_no", []), ignore_after, negated=True)
        no = _hits(words, fact.get("signals_no", []), ignore_after) or _hits(words, fact.get("signals_yes", []), ignore_after, negated=True)
        return bool(yes and no)
    if fact["type"] == "enum":
        matched = [o for o in fact.get("options", []) if _hits(words, o.get("signals", []), ignore_after)]
        return len(matched) > 1
    return False


def route(user_text, packs):
    """Which pack the text is about: {"pack_id", "method", "confidence", "top_words"}.

    Rules first: a clear winner on routing phrases and answered facts is used as is.
    Otherwise the naive Bayes model (engine/classifier.py) decides, if it's confident.
    Otherwise pack_id is None and the user picks the topic.
    """
    words = normalize(user_text).split()
    scores = rule_scores(words, packs)
    ranked = sorted((score for score, _ in scores.values()), reverse=True) + [0]
    best = max(scores, key=lambda k: scores[k][0]) if scores else None
    margin = ranked[0] - ranked[1]
    # Rules can decide only from a real topic phrase ("fafsa", "medi-cal", "wildfire"). Facts alone
    # (a word like "school" or "job") aren't enough, unless there's only one pack to choose from.
    rules_usable = best is not None and ranked[0] > 0 and (bool(scores[best][1]) or len(packs) == 1)

    model = _model(packs)
    probs = model.probabilities(user_text)
    if rules_usable and margin >= 2:
        pack_id, method = best, "rules"
    else:
        pack_id, _ = model.predict(user_text)
        method = "model"
        if pack_id is None and rules_usable and margin >= 1:
            pack_id, method = best, "rules"
    if pack_id is None:
        return {"pack_id": None, "method": None, "confidence": round(max(probs.values(), default=0.0), 2), "top_words": []}
    return {
        "pack_id": pack_id,
        "method": method,
        "confidence": round(probs.get(pack_id, 1.0), 2),
        "top_words": model.top_words(user_text, pack_id),
    }


ML_THRESHOLD = 0.97  # the fact models fill an answer only when at least this sure (picked on tests/extraction/dev.json: no wrong answers there)
_fact_models = {}


def fact_models(pack):
    """The trained fact-reading models for a pack (engine/ml/), or None if missing or out of date."""
    from engine.ml.fact_model import PackModels, fingerprint  # here, not at the top: engine/ml uses this file

    key = (pack["id"], fingerprint(pack))
    if key not in _fact_models:
        _fact_models[key] = PackModels.load(pack)
    return _fact_models[key]


def understand(user_text, packs, pack_id=None, use_model=True):
    """Returns {"pack_id", "facts", "evidence": {fact_id: [words]}, "guessed": {fact_id: confidence}, "routing"}.

    If pack_id is given (the user already picked a topic), only that pack is read.
    Rules read first. Then, if use_model, LifeBridge's fact models (engine/ml/) fill in answers the
    rules left blank, but only when they're at least ML_THRESHOLD sure. Those answers are listed in
    "guessed", so the confirm screen can say they were the model's guess.
    """
    user_text = (user_text or "").strip()
    if not user_text:
        raise ValueError("Please describe your situation.")
    if len(user_text) > MAX_INPUT_CHARS:
        raise ValueError(f"Please keep it under {MAX_INPUT_CHARS} characters.")

    words = normalize(user_text).split()
    if pack_id is None:
        routing = route(user_text, packs)
        pack_id = routing["pack_id"]
    else:
        routing = {"pack_id": pack_id, "method": "chosen", "confidence": 1.0, "top_words": []}
    if pack_id not in packs:
        return {"pack_id": None, "facts": {}, "evidence": {}, "guessed": {}, "routing": routing}

    pack = packs[pack_id]
    facts, evidence = {}, {}
    for fact in pack["facts"]:
        value, hits = read_fact(fact, words)
        if value is not None:
            facts[fact["id"]] = value
            evidence[fact["id"]] = hits
    guessed = {}
    models = fact_models(pack) if use_model else None
    if models:
        defs = {f["id"]: f for f in pack["facts"]}
        words_all = words
        for fact_id, (value, confidence, words) in models.predict(user_text, ML_THRESHOLD).items():
            if fact_id not in facts and rules_conflict(defs[fact_id], words_all):
                continue  # the text contradicts itself here; leave it for the user
            if fact_id not in facts:  # rules come first; the model only fills blanks
                facts[fact_id] = value
                evidence[fact_id] = words
                guessed[fact_id] = round(confidence, 2)
            elif defs[fact_id]["type"] == "multi":  # "choose all": add answers the rules missed (e.g. a misspelling)
                extra = [v for v in value if v not in facts[fact_id]]
                if extra:
                    facts[fact_id] = facts[fact_id] + extra
                    evidence[fact_id] = evidence[fact_id] + words
                    guessed[fact_id] = round(confidence, 2)
    facts, _dropped = clean_facts(pack, facts)  # same check as the question form
    evidence = {k: v for k, v in evidence.items() if k in facts}
    guessed = {k: v for k, v in guessed.items() if k in facts}
    return {"pack_id": pack_id, "facts": facts, "evidence": evidence, "guessed": guessed, "routing": routing}
