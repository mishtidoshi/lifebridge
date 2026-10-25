"""A small machine-learning model that guesses which topic (pack) a description is about.

It's a naive Bayes text classifier, written from scratch, trained only on the packs
themselves: each pack's routing phrases, example descriptions, title, summary, step
titles, and answer signals. Nothing is downloaded and no outside AI service is used.
Retraining happens automatically whenever packs are loaded, so adding a new pack
file teaches the model a new topic with no code changes.

The model only helps pick the topic. Rules still read the facts, and rules decide
which steps apply (engine/match.py), so the model never decides anyone's plan.

How naive Bayes works here, in short:
    P(topic | words)  ∝  P(topic) × P(word1 | topic) × P(word2 | topic) × ...
P(word | topic) is how often the word appears in that topic's training text,
with +1 smoothing so a word never seen in a topic doesn't make its chance zero.
"""

import math
from collections import Counter

from engine.facts import text as as_text
from engine.understand import BREAK, normalize

# Common words that say nothing about the topic.
STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "to", "in", "on", "at", "for", "with", "by", "from",
    "is", "are", "was", "were", "be", "been", "am", "i", "i'm", "im", "me", "my", "we", "our", "us", "you",
    "your", "they", "their", "it", "it's", "this", "that", "these", "those", "do", "does", "did", "have",
    "has", "had", "what", "how", "when", "where", "who", "which", "can", "will", "would", "should", "so",
    "about", "as", "just", "now", "get", "got", "need", "help", "there", "here", "some", "any", "all",
    "after", "before", "then", "also", "very", "really", "much", "many",
}

SIGNAL_WEIGHT = 3  # routing phrases count more than ordinary text
MIN_CONFIDENCE = 0.75  # below this, the model says "not sure" and the user picks the topic
MIN_LIFT = 2  # a word shown as a reason must be at least twice as common in that topic as in any other
MIN_WORDS = 2  # it also needs at least this many words it has seen before, so one stray word can't decide


def tokens(text):
    """Words and two-word phrases, without stopwords: "lost my medicaid" → ["lost", "medicaid", "lost medicaid"]."""
    words = [w for w in normalize(text).split() if w != BREAK and w not in STOPWORDS]
    return words + [f"{a} {b}" for a, b in zip(words, words[1:])]


def training_text(pack):
    """(text, weight) pairs the model learns a pack from."""
    yield as_text(pack["title"]), 2
    yield as_text(pack["summary"]), 1
    yield as_text(pack["routing_hint"]), 1
    for phrase in pack.get("routing_signals", []):
        yield phrase, SIGNAL_WEIGHT
    for example in pack["example_inputs"]:
        yield as_text(example), 2
    for step in pack["steps"]:
        yield as_text(step["title"]), 1
    for fact in pack["facts"]:
        if fact["id"] == "state":
            continue  # every pack asks for a state, so it says nothing about the topic
        yield as_text(fact["question"]), 1
        for option in fact.get("options", []):
            for phrase in option.get("signals", []):
                yield phrase, 1
        for phrase in fact.get("signals_yes", []) + fact.get("signals_no", []):
            yield phrase, 1


class TopicModel:
    def __init__(self, packs):
        self.counts = {}  # pack id → Counter of token weights
        self.totals = {}
        self.vocab = set()
        for pack_id, pack in packs.items():
            counter = Counter()
            for text, weight in training_text(pack):
                for tok in tokens(text):
                    counter[tok] += weight
            self.counts[pack_id] = counter
            self.totals[pack_id] = sum(counter.values())
            self.vocab |= set(counter)

    def probabilities(self, text):
        """{pack_id: probability}, adding up to 1. Every topic starts equally likely."""
        known = [t for t in tokens(text) if t in self.vocab]
        if not known or not self.counts:
            return {}
        v = len(self.vocab)
        logs = {
            pack_id: sum(math.log((counter[t] + 1) / (self.totals[pack_id] + v)) for t in known)
            for pack_id, counter in self.counts.items()
        }
        top = max(logs.values())
        exp = {k: math.exp(x - top) for k, x in logs.items()}
        total = sum(exp.values())
        return {k: x / total for k, x in exp.items()}

    def top_words(self, text, pack_id, n=3):
        """The words in the text that most point to this pack (for "why this topic")."""
        if pack_id not in self.counts:
            return []
        others = [k for k in self.counts if k != pack_id]
        v = len(self.vocab)

        def lift(tok):
            mine = (self.counts[pack_id][tok] + 1) / (self.totals[pack_id] + v)
            rest = max(((self.counts[k][tok] + 1) / (self.totals[k] + v) for k in others), default=1 / v)
            return mine / rest

        typed = f" {normalize(text)} "
        seen = []
        for tok in tokens(text):
            if " " in tok and f" {tok} " not in typed:
                continue  # a pair made by skipping stopwords isn't something the user actually wrote
            if tok in self.counts[pack_id] and tok not in seen and lift(tok) >= MIN_LIFT:
                seen.append(tok)
        best = sorted(seen, key=lift, reverse=True)
        pairs = [t for t in best if " " in t]
        # Don't list "medi" next to "medi cal".
        best = [t for t in best if " " in t or not any(t in p.split() for p in pairs)]
        return best[:n]

    def predict(self, text):
        """(pack_id, confidence), or (None, confidence) when the model isn't sure enough."""
        probs = self.probabilities(text)
        if not probs:
            return None, 0.0
        pack_id = max(probs, key=probs.get)
        confidence = probs[pack_id]
        known = sum(1 for t in tokens(text) if t in self.vocab)
        if len(probs) > 1 and (confidence < MIN_CONFIDENCE or known < MIN_WORDS):
            return None, confidence
        return pack_id, confidence
