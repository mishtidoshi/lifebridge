"""Turn text into features (the numbers a model learns from).

For "My mom isn't self-employed, I'm a senoir" the features include:
    words           "senoir", "self", "employed"
    word pairs      "self employed"
    letter chunks   3 and 4 letters: "#se", "sen", "#sen", "seno", "enoi", "noir", "oir#"... (so a
                    typo like "senoir" still shares most chunks with "senior")
    scope markers   words right after "not"/"isn't" get NOT_ ("NOT_self"), and words right after a
                    parent word get PAR_ ("PAR_undocumented"), so the model can learn that
                    "my mom is undocumented" is about the parent, not the student.
"""

from engine.understand import BREAK, CLAUSE_WORDS, NEGATIONS, normalize

PARENT_WORDS = {
    "mom", "dad", "mother", "father", "parent", "parents", "stepmom", "stepdad", "stepmother",
    "stepfather", "guardian", "mum", "mama", "papa", "folks",
}
SCOPE = 3  # how many words after "not" or "mom" are marked


def tokens(text):
    """Words with scope markers, e.g. ["i'm", "NOT_self", "NOT_employed"]."""
    out = []
    neg_left = par_left = 0
    for word in normalize(text).split():
        if word in CLAUSE_WORDS:
            neg_left = par_left = 0
            continue
        if word in NEGATIONS:
            neg_left = SCOPE
            continue
        prefix = ""
        if neg_left:
            prefix += "NOT_"
            neg_left -= 1
        if par_left:
            prefix += "PAR_"
            par_left -= 1
        out.append(prefix + word)
        if word in PARENT_WORDS:
            par_left = SCOPE
    return out


def _plain(tok):
    while tok.startswith(("NOT_", "PAR_")):
        tok = tok[4:]
    return tok


def featurize(text):
    """{feature: value} plus {feature: the word it came from} (to explain predictions)."""
    toks = tokens(text)
    feats, source = {"__bias__": 1.0}, {}

    def add(name, word):
        feats[name] = feats.get(name, 0.0) + 1.0
        source.setdefault(name, word)

    for tok in toks:
        word = tok
        while word.startswith(("NOT_", "PAR_")):
            word = word[4:]
        prefix = tok[: len(tok) - len(word)]
        add("w=" + tok, word)
        padded = f"#{word}#"
        if len(word) >= 4:
            for n in (3, 4):
                for i in range(len(padded) - n + 1):
                    add(f"c{n}={prefix}{padded[i:i + n]}", word)
    for a, b in zip(toks, toks[1:]):
        add(f"b={a} {b}", f"{_plain(a)} {_plain(b)}")
    # scale so long texts don't get bigger scores just for being long
    # (fact_model.py reads each part of a long description separately, so evidence isn't watered down)
    norm = sum(v * v for v in feats.values()) ** 0.5
    return {k: v / norm for k, v in feats.items()}, source
