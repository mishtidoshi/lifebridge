# LifeBridge

When life changes, know what to do next. **Rules listen, rules decide, official sources explain.**

A Congressional App Challenge 2026 project (CA-16). Student project, not a government website.

Three topics, each a situation pack on the same engine (adding a topic = adding a JSON file):

| Topic | Pack | Covers | Sources |
|---|---|---|---|
| College financial aid | `packs/financial_aid.json` | The FAFSA for everyone, plus every state's (and DC's) grants, deadlines, and alternative applications | `packs/sources/financial_aid_states.md` |
| Medicaid | `packs/medicaid.json` | Renewals, reporting changes, the 2027 work rules, getting coverage back, in any state; once someone picks California, extra Medi-Cal steps | `packs/sources/medicaid.md` |
| Natural disasters | `packs/disaster.json` | Preparing (wildfire, flood, earthquake, hurricane), staying safe, and recovering (insurance, FEMA, SBA, appeals) | `packs/sources/disaster.md` |

## Layout

```
lifebridge/
  app.py              Python API (FastAPI): /api/packs, /api/understand, /api/plan
  engine/
    pack_loader.py    validates packs at startup
    facts.py          checks facts against a pack
    understand.py     LifeBridge's own reader: picks the topic, then typed text → facts (no AI service)
    classifier.py     a naive Bayes model, trained on the packs, that helps pick the topic
    ml/               machine-learning fact readers (softmax regression), trained by tools/train_models.py
    changes.py        "What changed?": compares the plan before and after an update
    calendar_file.py  one deadline as a calendar (.ics) file
    match.py          rules: which steps apply (yes / no / unknown)     ← student-written
    sequence.py       rules: order steps by dependencies + deadlines    ← student-written
    plan.py           puts it together for the plan screen
  packs/              one JSON file per life situation + SCHEMA.md (sources/ lists where the facts came from)
  mobile/             the app: React Native + TypeScript (Expo), runs on iPhone, Android, and the web
  models/             trained fact-reading models (made by tools/train_models.py)
  tools/              validate_pack.py, check_sources.py, train_models.py
  tests/
```

## How topics are picked (rules first, then a small model)

When someone types "What's happening?" on the home screen, `engine/understand.py` decides the topic:

1. **Rules.** Each pack lists routing phrases ("fafsa", "medi-cal", "wildfire"). A clear winner on
   those phrases (plus facts the text answers) is used as is.
2. **Model.** Otherwise `engine/classifier.py`, a naive Bayes text classifier written from scratch,
   guesses from the words. It's trained only on the packs' own text (titles, routing phrases, example
   descriptions, step titles, answer phrases), so it retrains itself whenever a pack changes.
3. **Ask.** If neither is confident, the app asks the user to pick the topic instead of guessing.

The model only picks the topic. Rules still read the facts, the user confirms them, and rules decide
which steps apply, so the model never decides anyone's plan. The confirm screen shows the topic, the
words that pointed to it, and a "Wrong topic?" button.

**Measured:** `tests/routing/cases.json` has 41 hand-written descriptions (including 5 that fit no
topic) kept separate from the training text. Current result: **39/41 (95%)** correct, and no
off-topic text is sent to a topic. Both misses make the app ask for the topic rather than pick a wrong one.

## Machine learning: reading answers from messy text

Rules read typed text very precisely, but only when the words match exactly. LifeBridge also has its own machine-learning models (`engine/ml/`), written
from scratch in plain Python with no outside AI service:

- **Model:** one per question, a softmax (multi-class logistic) regression, which is a one-layer
  neural network, trained by stochastic gradient descent (`engine/ml/softmax.py`).
- **Features** (`engine/ml/features.py`): words, word pairs, and 3- and 4-letter chunks (so "senoir"
  still looks like "senior"), plus markers for words right after "not" (`NOT_`) and after a parent
  word (`PAR_`), so "my mom is undocumented" isn't read as the student's status.
- **Training data** (`engine/ml/training_data.py`): about 3,000 sentences per topic, generated only
  from each pack's own phrases, with made-up typos, negations, parent sentences, and neutral topic
  text. None of the test descriptions are used for training.
- **Training:** `python tools/train_models.py` (about 2 minutes, no internet needed). It saves
  `models/<pack>.json` with a fingerprint of the pack; if a pack changes, the app falls back to rules
  only and `tests/unit/test_ml.py` fails until the models are retrained.

**Rules first, then the model.** Rules read the text first. The model fills only answers the rules
left blank, and only when it's at least 97% sure. Long descriptions are also read clause by clause,
so one answer isn't watered down by the rest. Two safeguards keep it from guessing wildly:

- **Grounding:** a guess is kept only if the text has a meaningful word that matches, or is a likely
  misspelling of, a word in that answer's phrases ("senoir" ≈ "senior"). Filler words like "have"
  and "just" don't count.
- **Contradictions stay blank:** if the rules see two different answers ("I'm a senior. Actually I'm
  a junior."), the model doesn't pick one.

On the confirm screen, the model's answers say "LifeBridge's model guessed this (98% sure) from
'senoir'. Please check it." Questions with strict official definitions (FAFSA dependency status, a
person's age group) are never guessed (`"model": false` in the pack). Rules always decide which
steps apply.

**Measured** (on descriptions the model never saw; the 97% threshold was picked on a separate tuning
set, `tests/extraction/dev.json`):

| Test set | Rules only | Rules + model |
|---|---|---|
| Misspelled and loose wording (`tests/extraction/typos.json`, 30 descriptions) | 13 correct, 24 blank, 1 wrong | **31 correct**, 6 blank, 1 wrong |
| Clean text (`tests/extraction/cases.json`, 36 descriptions) | 75 correct, 1 blank, 1 wrong | 76 correct, 0 blank, 1 wrong |
| Tuning set (`tests/extraction/dev.json`, 20 descriptions) | 11 correct, 8 blank, 1 wrong | 17 correct, 3 blank, 0 wrong |

So the model more than doubles what's read from messy text without adding mistakes. A few expected
answers in the test files were corrected after the first run because the model's reading was right
and the expectation was incomplete; each file notes this. Run `pytest -s tests/unit/test_ml.py` to
see the numbers.

Two models in total, both LifeBridge's own: a naive Bayes topic classifier (`engine/classifier.py`)
and the fact models above. Turning "Smart reading" off in Settings turns both off.

## Privacy

- "Describe your situation" is read on the LifeBridge server by its own reader, using phrases listed
  in each pack (`packs/SCHEMA.md` §2a) and a small model trained only on the packs. It is never sent to
  an AI company, never used for training, and isn't stored or logged. The confirm screen shows which
  topic was picked and why, and which words each answer came from.
- "Answer questions instead": answers go to the LifeBridge server only to build the plan and are
  not stored.
- Progress (tracker, checklist, typed-in dates, your answers) is saved only on your device, unless
  you create an account. Then your answers, progress, and name are also saved to your account,
  **encrypted on your device first** with a key made from your password (XChaCha20-Poly1305, key from
  scrypt; see `mobile/src/lib/crypto.ts`). Supabase only stores scrambled data and your email; no one
  with access to the database, including us, can read your answers. Everything also travels over HTTPS.
- Because only your password can unlock it, resetting a forgotten password means your old saved plan
  can't be opened. You start a new one.
- Signing out removes your plan and key from the device; "Delete my account" removes everything from the server.

## Credits

- Photos: Unsplash (Unsplash License) and StockSnap (CC0). See `mobile/assets/images/CREDITS.md`.
- Icons: Lucide (ISC license). Fonts: Fraunces, Nunito, Caveat (Google Fonts, SIL Open Font License).

