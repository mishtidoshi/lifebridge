"""One small model per question in a pack, trained on engine/ml/training_data.py sentences.

    enum and bool questions: softmax regression over the answers plus NONE ("the text doesn't say")
    multi questions: one yes/no model per option ("does the text mention community college?")

Trained models are saved in models/<pack_id>.json by tools/train_models.py, with a fingerprint
of the pack's questions and phrases. If the pack changes, the fingerprint no longer matches and
the app uses rules only until the models are retrained (a test catches this).
"""

import hashlib
import json
import re
from pathlib import Path

from engine.ml.features import featurize
from engine.understand import BREAK, normalize
from engine.ml.softmax import SoftmaxRegression
from engine.ml.training_data import NONE, examples

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
TRAINER_VERSION = 1


def fingerprint(pack):
    """Changes whenever anything the models learn from changes."""
    relevant = [
        {k: f.get(k) for k in ("id", "type", "options", "signals_yes", "signals_no", "ignore_if_after", "model")}
        for f in pack["facts"]
    ]
    blob = json.dumps({"v": TRAINER_VERSION, "facts": relevant, "title": pack["title"]}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def parts(text):
    """The whole text, then each clause: "senior in texas, my parents are self employed" →
    [whole, "senior in texas", "my parents are self employed"]."""
    pieces = [p.strip() for p in re.split(r"[.,;!?]+|\band\b|\bbut\b|\balso\b", text, flags=re.IGNORECASE)]
    pieces = [p for p in pieces if len(p.split()) >= 1]
    return [text] + (pieces if len(pieces) > 1 else [])


# Words too common to count as evidence for an answer.
FILLER = {
    "i", "i'm", "im", "a", "an", "the", "my", "our", "we", "me", "is", "are", "am", "was", "be", "have", "has",
    "had", "do", "does", "did", "to", "of", "in", "on", "at", "for", "with", "and", "or", "but", "not", "no",
    "just", "it", "this", "that", "as", "so", "get", "got", "need", "your", "their", "they", "he", "she", "his",
    "her", "who", "what", "from", "about", "will", "can", "all",
}


def edit_distance(a, b, limit=2):
    """How many letters to add, drop, or change to turn a into b (stops early past `limit`)."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def close(word, target):
    """Same word, or a likely misspelling of it (longer words may be off by more letters)."""
    if word == target:
        return True
    if len(target) < 4 or word[:1] != target[:1]:
        return False
    return edit_distance(word, target) <= (1 if len(target) < 5 else 2)


def answer_words(pack):
    """(fact id, value) → the meaningful words in the pack's phrases for that answer."""
    out = {}
    for fact in pack["facts"]:
        pairs = []
        for option in fact.get("options", []):
            pairs += [(option["value"], p) for p in option.get("signals", [])]
        pairs += [(True, p) for p in fact.get("signals_yes", [])] + [(False, p) for p in fact.get("signals_no", [])]
        for value, phrase in pairs:
            words = {w for w in normalize(phrase).split() if w not in FILLER and w != BREAK}
            out.setdefault((fact["id"], _key(value)), set()).update(words)
    return out


def _key(value):
    return json.dumps(value)  # True → "true", "ca" → "\"ca\"" (class names must be strings)


class PackModels:
    def __init__(self, pack_id, models, fp, grounding=None):
        self.pack_id, self.models, self.fingerprint = pack_id, models, fp
        self.grounding = grounding or {}  # (fact id, value) → words from the pack's phrases

    @classmethod
    def train(cls, pack, epochs=20):
        data = examples(pack)
        feats = [(featurize(text)[0], labels) for text, labels in data]
        facts = {f["id"]: f for f in pack["facts"]}
        models = {}
        for fact_id in data[0][1]:
            fact = facts[fact_id]
            if fact.get("model") is False:
                continue  # the pack says not to guess this one (it has a strict official definition)
            if fact["type"] == "multi":
                for option in fact["options"]:
                    rows = [(f, "yes" if option["value"] in labels[fact_id] else "no") for f, labels in feats]
                    if any(c == "yes" for _, c in rows):
                        models[f"{fact_id}={option['value']}"] = SoftmaxRegression(["no", "yes"], epochs=epochs).fit(rows)
            else:
                rows = [(f, NONE if labels[fact_id] == NONE else _key(labels[fact_id])) for f, labels in feats]
                classes = sorted({c for _, c in rows})
                models[fact_id] = SoftmaxRegression(classes, epochs=epochs).fit(rows)
        return cls(pack["id"], models, fingerprint(pack), answer_words(pack))

    def save(self):
        MODEL_DIR.mkdir(exist_ok=True)
        data = {"pack_id": self.pack_id, "fingerprint": self.fingerprint, "trainer_version": TRAINER_VERSION,
                "models": {k: m.to_json() for k, m in self.models.items()}}
        (MODEL_DIR / f"{self.pack_id}.json").write_text(json.dumps(data, separators=(",", ":")))

    @classmethod
    def load(cls, pack):
        """The saved models for this pack, or None if missing or out of date."""
        path = MODEL_DIR / f"{pack['id']}.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        if data.get("fingerprint") != fingerprint(pack):
            return None
        models = {k: SoftmaxRegression.from_json(m) for k, m in data["models"].items()}
        return cls(pack["id"], models, data["fingerprint"], answer_words(pack))

    def grounded(self, fact_id, value, text_words):
        """True if the text has a word that is (or is a likely misspelling of) a word from this answer's
        phrases. A guess with no such word is the model being overconfident, so it's dropped."""
        targets = self.grounding.get((fact_id, _key(value)))
        if targets is None:
            return True
        return any(close(w, t) for w in text_words if w not in FILLER for t in targets)

    def predict(self, text, threshold):
        """{fact_id: (value, confidence, words)} for answers the models are at least `threshold` sure of.

        A long description is also read part by part (split at commas, periods, "and", "but"), and the
        most confident reading of each question wins, so one answer isn't watered down by the rest.
        Short pieces can make the model overconfident; the grounding check (below) catches that.
        """
        out = {}
        for part in parts(text):
            for fact_id, (value, conf, words) in self._predict_one(part, threshold).items():
                if fact_id not in out:
                    out[fact_id] = (value, conf, words)
                elif isinstance(value, list):  # "choose all": collect answers from every part
                    old_value, old_conf, old_words = out[fact_id]
                    extra = [v for v in value if v not in old_value]
                    if extra:
                        out[fact_id] = (old_value + extra, min(old_conf, conf), old_words + words)
                elif conf > out[fact_id][1]:
                    out[fact_id] = (value, conf, words)
        return out

    def _predict_one(self, text, threshold):
        feats, source = featurize(text)
        text_words = [w for w in normalize(text).split() if w != BREAK]
        out, multi = {}, {}
        for key, model in self.models.items():
            probs = model.predict_proba(feats)
            if "=" in key:  # one option of a multi question
                fact_id, value = key.split("=", 1)
                if probs["yes"] >= threshold and self.grounded(fact_id, value, text_words):
                    multi.setdefault(fact_id, []).append((value, probs["yes"], model.explain(feats, "yes", "no", source)))
                continue
            best = max(probs, key=probs.get)
            if best != NONE and probs[best] >= threshold and self.grounded(key, json.loads(best), text_words):
                out[key] = (json.loads(best), probs[best], model.explain(feats, best, NONE, source))
        for fact_id, hits in multi.items():
            out[fact_id] = ([v for v, _, _ in hits], min(p for _, p, _ in hits), [w for _, _, ws in hits for w in ws])
        return out
