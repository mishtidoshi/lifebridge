"""Logistic regression with several classes (softmax regression), written from scratch.

It's the simplest neural network: one layer. For each class (each possible answer) it keeps a
weight per feature. To predict, it adds up the weights of the features in the text (a score per
class) and turns the scores into probabilities with softmax:

    P(class) = e^score(class) / sum of e^score(every class)

Training is stochastic gradient descent: for each example, nudge every weight in the direction
that makes the right answer more likely (the gradient of the log-loss), with a little L2
regularization so no single feature gets too much say.
"""

import math
import random


class SoftmaxRegression:
    def __init__(self, classes, learning_rate=8.0, l2=1e-5, epochs=20, seed=7):
        self.classes = list(classes)
        self.lr, self.l2, self.epochs, self.seed = learning_rate, l2, epochs, seed
        self.weights = {c: {} for c in self.classes}  # class → feature → weight

    def scores(self, feats):
        return {c: sum(w.get(f, 0.0) * v for f, v in feats.items()) for c, w in self.weights.items()}

    def predict_proba(self, feats):
        scores = self.scores(feats)
        top = max(scores.values())
        exp = {c: math.exp(s - top) for c, s in scores.items()}
        total = sum(exp.values())
        return {c: e / total for c, e in exp.items()}

    def fit(self, examples):
        """examples: list of (features, class)."""
        rng = random.Random(self.seed)
        data = list(examples)
        for epoch in range(self.epochs):
            rng.shuffle(data)
            lr = self.lr / (1 + 0.3 * epoch)  # take smaller steps as training goes on
            for feats, label in data:
                probs = self.predict_proba(feats)
                for c in self.classes:
                    # gradient of the log-loss for class c: (P(c) - 1 if c is right else P(c))
                    error = probs[c] - (1.0 if c == label else 0.0)
                    if abs(error) < 1e-4:
                        continue
                    w = self.weights[c]
                    for f, v in feats.items():
                        old = w.get(f, 0.0)
                        w[f] = old - lr * (error * v + self.l2 * old)
        return self

    def explain(self, feats, cls, against, source, n=2):
        """The words that pushed most toward `cls` instead of `against`."""
        push = {}
        for f, v in feats.items():
            if f == "__bias__":
                continue
            d = (self.weights[cls].get(f, 0.0) - self.weights[against].get(f, 0.0)) * v
            word = source.get(f, f)
            push[word] = push.get(word, 0.0) + d
        return [w for w, d in sorted(push.items(), key=lambda x: -x[1]) if d > 0][:n]

    # --- saving (weights are rounded and tiny ones dropped, to keep the file small) ---------

    def to_json(self, min_weight=0.6):  # tiny weights barely change predictions (checked on tests/extraction/dev.json)
        return {
            "classes": self.classes,
            "weights": {c: {f: round(w, 2) for f, w in ws.items() if abs(w) >= min_weight} for c, ws in self.weights.items()},
        }

    @classmethod
    def from_json(cls, data):
        model = cls(data["classes"])
        model.weights = {c: dict(ws) for c, ws in data["weights"].items()}
        return model
