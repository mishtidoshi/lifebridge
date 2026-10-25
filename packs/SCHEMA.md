# Pathway Pack Format (v1)

A **pathway pack** is one JSON file in `packs/` that describes everything LifeBridge
knows about one life situation. The engine reads packs; it never contains
situation-specific code. Adding a situation = adding a pack file.

Status of this document: **draft — lock by Oct 6.** Before locking, sketch the
Medi-Cal pack on paper in this format; if it needs anything the format can't
express, add it now. After locking, only add optional fields; never rename or
remove fields (that would break the engine and the "no engine changes" claim).

---

## 1. Top level

```json
{
  "schema_version": 1,
  "id": "financial_aid",
  "title": "Financial Aid for College (California)",
  "summary": "Apply for federal and California aid, step by step.",
  "icon": "graduation-cap",
  "status": "draft",
  "region": "CA",
  "routing_hint": "Student or family applying for college financial aid ...",
  "example_inputs": ["I'm a senior applying to UCs and CSUs ..."],
  "cycle": {"label": "2027–28 school year", "starts": "2026-10-01", "ends": "2028-06-30"},
  "notices": [ ... ],
  "facts": [ ... ],
  "documents": [ ... ],
  "deadlines": [ ... ],
  "steps": [ ... ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `schema_version` | yes | Always `1` for now. |
| `id` | yes | Unique, `snake_case`, same as the filename. |
| `title`, `summary` | yes | Shown on the life-events home screen. |
| `icon` | no | Name of an icon in `static/icons/`. |
| `status` | yes | `"draft"` or `"verified"`. In draft, missing sources are **warnings**; in verified, they are **errors**. |
| `region` | yes | Where the pack applies, e.g. `"CA"`, `"US"`. |
| `routing_hint` | yes | One or two sentences describing who this pack is for. |
| `routing_signals` | no | Phrases that point to this pack (e.g. `"fafsa"`, `"financial aid"`). The reader picks the pack whose signals match best; if that's unclear, a naive Bayes model trained on every pack's text decides, or the user is asked (§2a). |
| `example_inputs` | yes | 2–4 sample user descriptions. Used for routing and for tests. |
| `cycle` | no | For packs tied to a yearly cycle (like financial aid): which cycle the pack covers. If today is outside `starts`–`ends`, the plan shows a warning that the information may be out of date. |
| `notices` | no | Messages shown above the plan for some users (§1a). |
| `facts` | yes | What the pack needs to know about the user (§2). |
| `documents` | yes | Every document any step needs, defined **once** (§3). |
| `deadlines` | yes | Every deadline, defined **once** (§4). |
| `steps` | yes | The steps (§5). |

**Text fields** (`title`, `summary`, `question`, `label`, `plain_explanation`, …) are
plain strings for now. For Spanish later, any text field may become
`{"en": "...", "es": "..."}`; the loader will accept both forms.

### 1a. Notices: when the plan doesn't fit the user

```json
{
  "id": "junior_next_cycle",
  "applies_if": {"fact": "grade_level", "eq": "hs_junior"},
  "message": "This plan is for students starting college in fall 2027. Juniors apply in the next cycle, which opens October 1, 2027. Here's how to get ready now.",
  "stop_plan": false
}
```

| Field | Meaning |
|---|---|
| `applies_if` | Rule (§6). The notice shows only if the result is `yes`. |
| `message` | Text shown above the plan. |
| `stop_plan` | If `true`, show only the message and no steps (the pack doesn't fit this user at all). |
| `source_url` | Optional link. |

---

## 2. Facts — what we need to know

```json
{
  "id": "citizenship_status",
  "question": "What is the student's citizenship or immigration status?",
  "type": "enum",
  "options": [
    {"value": "us_citizen", "label": "U.S. citizen"},
    {"value": "undocumented", "label": "Undocumented"}
  ],
  "ask_if_missing": true,
  "sensitive": true
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Used in rules. |
| `question` | yes | Asked in the follow-up form if the AI couldn't find it. |
| `type` | yes | `"enum"` (one option), `"multi"` (several options), `"bool"`, or `"date"`. |
| `options` | for enum/multi | Allowed values with human labels. |
| `ask_if_missing` | no (default `false`) | If `true` and unknown after Understand, the app asks the user. |
| `required` | no (default `false`) | If `true`, the app won't build a plan until it's answered (e.g. the state, which decides which state steps apply). |
| `sensitive` | no | If `true`, the UI shows a short "we don't store this" note next to the question. |

An option may have `"means_unknown": true` (for "Not sure" / "Prefer not to say").
Choosing it counts as **unknown** in rules, so related steps show as "May apply —
check this" instead of disappearing.

The Understand step must return **only** these fact ids and **only** the listed
values. Anything else is dropped. A fact the user didn't mention stays **unknown**
— the reader must not guess. The user then sees the facts on the **"Here's what I
understood"** screen and can fix any of them before the plan is built.

**Facts never come from the reader alone.** They're either answered in the question
form or confirmed by the user on that screen.

**Numbers as groups.** There is no number type. Use an `enum` of groups instead
(e.g., age: `under_19`, `19_to_64`, `65_plus`). It's easier to ask, easier to
explain, and keeps the rule language small.

**"Already done" facts.** Facts may describe progress, e.g.
`{"id": "fafsa_status", "type": "enum", "options": [not_started, in_progress, submitted]}`.
Steps use them in `done_if` (§5).

---

### 2a. Signals: how typed text becomes facts

"Describe your situation" is read by LifeBridge's own rule-based reader
(`engine/understand.py`). No AI service is involved. Packs tell it which phrases
point to which answer:

```json
{"value": "hs_senior", "label": "High school senior", "signals": ["senior", "12th grade"]}
```

```json
{"id": "parent_self_employed", "type": "bool",
 "signals_yes": ["self employed", "owns a business"], "signals_no": []}
```

| Field | Where | Meaning |
|---|---|---|
| `signals` | enum/multi option | Phrases that mean this option. |
| `signals_yes`, `signals_no` | bool fact | Phrases that mean true / false. |
| `ignore_if_after` | any fact | Skip a phrase right after one of these words. Use parent words on student facts, so "my **mom** is undocumented" doesn't set the *student's* status. |
| `routing_signals` | pack | Phrases that point to this pack (§1). |

How the reader uses them:

- Text and phrases are normalized: lowercase, punctuation removed, "U.S." → "us",
  so `"self employed"` also matches "Self-employed". Phrases match whole words only
  ("uc" doesn't match inside "lucky").
- A phrase right after a negation ("not", "don't", "aren't"…, within 3 words, in the
  same clause) is skipped. For bool facts it counts for the *other* answer:
  "aren't self-employed" means `false`.
- enum: exactly one option matched → that value; none or several → **unknown**.
  multi: every matched option. bool: only yes or only no → that value; both → unknown.
- The confirm screen shows which words each answer came from ("From your words: 'senior'").

Signals are optional. A fact without them is simply asked in the follow-up questions.

**Picking the pack** (`route()` in `engine/understand.py`): 2 points per routing phrase found,
plus 1 per fact the text answers (facts every pack asks, like the state, don't count). A pack wins
on rules only with at least one routing phrase and a 2-point lead. Otherwise the naive Bayes model in
`engine/classifier.py` decides if it's at least 75% sure and recognizes at least 2 words; if not, the
user picks. The model learns from each pack's title, summary, `routing_hint`, `routing_signals`,
`example_inputs`, step titles, and fact signals, so a new pack needs no code changes.

---

## 3. Documents — defined once, reused across steps

```json
{
  "id": "tax_returns_2025",
  "name": "2025 federal tax return(s)",
  "who": "Student and parent(s), if they filed",
  "note": "Used for the FAFSA/CADAA and often for college forms.",
  "applies_if": {"always": true}
}
```

Steps list document **ids** in `documents`. The engine builds **one combined
checklist** from the documents used by the steps in the user's plan, showing which
steps each document is for, so the user gathers it once.

`applies_if` (optional) uses the same rule language as steps (§6). Example: business
records only when a parent is self-employed.

---

## 4. Deadlines — defined once, reused across steps

```json
{
  "id": "cal_grant_deadline",
  "label": "Cal Grant deadline (application + GPA)",
  "date": "2027-03-02",
  "kind": "hard",
  "note": "Check CSAC for any extension.",
  "source_url": "https://www.csac.ca.gov/",
  "last_verified": null
}
```

| Field | Meaning |
|---|---|
| `date` | ISO date `YYYY-MM-DD`, or `null` if it depends on the user (see `kind`). |
| `kind` | `"hard"` (miss it, lose aid), `"priority"` (earlier = better chance), `"varies"` (different per college/county — user enters it), `"from_letter"` (the date is on a letter the user received). |
| `from_fact`, `offset_days` | Optional, `from_letter` only. Works out the date from a `date` fact, e.g. `"from_fact": "notice_date", "offset_days": 30` → 30 days after the letter. If the fact is unknown, the user types the date instead. |
| `asap` | Optional, `varies` only. `true` when the official deadline is "as soon as possible" (aid given out while money lasts). Shown as "As soon as possible" instead of asking the user for a date. |
| `repeat_months` | Optional. The deadline repeats (e.g., `6` for six-month Medi-Cal renewals). The engine shows the **next** upcoming date, counting from `date` or `from_fact`. |
| `if_missed` | Optional text shown once the date has passed: what the user can still do. |
| `source_url`, `last_verified` | Same rules as steps (§5). |

```json
{
  "id": "renewal_return_by",
  "label": "Return your renewal form",
  "date": null,
  "kind": "from_letter",
  "from_fact": "renewal_notice_date",
  "offset_days": 60,
  "repeat_months": 6,
  "if_missed": "Contact your county office right away. You may still be able to turn it in late.",
  "source_url": null,
  "last_verified": null
}
```
*(Example of the format only; the real Medi-Cal numbers must come from DHCS.)*

**Today's date matters.** The engine always receives `today`. Each deadline shown is
`upcoming`, `soon` (within 14 days), or `passed`. A passed deadline is shown with its
`if_missed` text and is never used for ordering.

Every deadline with a `date` gets an **Add to Calendar** (`.ics`) button and appears on
the deadline timeline. `varies` / `from_letter` deadlines let the user type the date;
it's saved only in their browser.

---

## 5. Steps

```json
{
  "id": "submit_fafsa",
  "title": "Submit the FAFSA",
  "applies_if": {"fact": "application_type", "eq": "fafsa"},
  "depends_on": ["fafsa_create_accounts", "gather_documents", "list_colleges"],
  "documents": ["tax_returns_2025", "ssn_or_itin"],
  "deadlines": ["cal_grant_deadline"],
  "where": {"label": "StudentAid.gov", "url": "https://studentaid.gov/"},
  "plain_explanation": "Pre-written explanation shown if the AI is off.",
  "source_text": "Exact text copied from the official page.",
  "source_url": "https://studentaid.gov/...",
  "last_verified": "2026-10-05",
  "estimated_time": "45–60 minutes",
  "letter_signals": ["FAFSA Submission Summary"]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique within the pack. |
| `title` | yes | Short action, starts with a verb. |
| `applies_if` | yes | Rule (§6). Use `{"always": true}` for every user. |
| `done_if` | no | Rule (§6). If `yes`, the step starts as **Done** in the tracker (e.g., `{"fact": "fafsa_status", "eq": "submitted"}`), so the user starts where they actually are. They can change it. |
| `depends_on` | yes (may be `[]`) | Step ids that must come first. |
| `documents` | yes (may be `[]`) | Document ids (§3). |
| `deadlines` | yes (may be `[]`) | Deadline ids (§4). |
| `where` | no | Where to do it: website or office. |
| `plain_explanation` | yes | Plain-language explanation shown on the step card, ~2–4 sentences, 8th-grade reading level. This is the main explanation; AI personalization is a stretch feature. |
| `source_text` | yes* | Official text, shown under "What the official source says." If AI personalization is added later, the AI may use only this text. |
| `source_url` | yes* | Official page (government, CSAC, college). |
| `last_verified` | yes* | Date a person last checked the source, or `null`. |
| `estimated_time` | no | Shown on the step card. |
| `letter_signals` | no | Phrases found in official letters about this step (for the stretch **letter helper**). |

\* Warning in `draft` packs, error in `verified` packs.

**Dependency rule:** if a step in `depends_on` doesn't apply to this user, that
dependency is ignored. This allows "either/or" paths (e.g., `webgrants_account`
depends on both `submit_fafsa` and `submit_cadaa`; only one applies to any user).

**Tracker states** are fixed by the engine, not the pack:
To do → Gathering documents → Submitted → Waiting → Follow-up → Done.

---

## 6. Rule language (`applies_if`)

Rules are small and readable on purpose, so the app can show
**"Why this applies to you."**

| Rule | True when |
|---|---|
| `{"always": true}` | always |
| `{"fact": "x", "eq": "v"}` | fact `x` equals `v` |
| `{"fact": "x", "in": ["a", "b"]}` | fact `x` is one of the values |
| `{"fact": "x", "has": "v"}` | multi-fact `x` includes `v` |
| `{"fact": "x", "has_any": ["a", "b"]}` | multi-fact `x` includes at least one |
| `{"all": [rule, ...]}` | every rule is true |
| `{"any": [rule, ...]}` | at least one rule is true |
| `{"not": rule}` | rule is false |

**Three answers, not two.** Each rule evaluates to `yes`, `no`, or `unknown`
(when a fact it needs is unknown):

| Result | Shown as |
|---|---|
| `yes` | In the plan. "Why this applies: you said *[fact label: option label]*." |
| `unknown` | In the plan, marked **"May apply — check this,"** with the question that would settle it. |
| `no` | Not in the plan. |

`all`: `no` if any part is `no`; else `unknown` if any part is `unknown`; else `yes`.
`any`: `yes` if any part is `yes`; else `unknown` if any part is `unknown`; else `no`.
`not`: swaps `yes`/`no`; `unknown` stays `unknown`.

The "why" text is built automatically from the fact's `question`/option `label`, so
rules don't need extra wording.

**Too many "may apply" steps?** The plan groups them under one box, "Answer N
quick questions to make your plan exact," listing the unknown facts that would
settle them (only the facts those rules actually use).

---

## 7. Ordering (Sequence)

1. Keep steps whose rule is `yes` or `unknown`.
2. Drop `depends_on` links to steps that were removed.
3. Give each step an **effective deadline**: the earliest **upcoming** dated deadline of the step
   itself **or any step that (directly or indirectly) depends on it**. So "Choose
   FAFSA or Dream Act" inherits the Cal Grant deadline from "Submit the FAFSA" —
   it's urgent because what comes after it is urgent. Passed deadlines don't count.
4. Topological sort (Kahn's algorithm). When several steps are ready at once, pick
   the one with the **earliest effective deadline** first; steps with no effective
   deadline go after dated ones; remaining ties keep pack order.
5. Steps marked Done by `done_if` stay in the list (shown as done) but don't affect ordering.
   The plan's **"Do this next"** is the first step that isn't done.

---

## 8. Validator checks (run at app startup)

**Errors (app refuses to load the pack):**
- not valid JSON, or the pack `id` doesn't match the filename
- missing required field, wrong type, duplicate id, or an id that isn't `snake_case`
- a rule uses an unknown fact id, or a value not in that fact's `options`
- a rule is malformed (no operator, two operators, empty `all`/`any`, `has` on a non-multi fact, non-boolean value for a bool fact)
- `depends_on`, `documents`, or `deadlines` references an id that doesn't exist
- a dependency cycle
- `asap` that isn't a boolean or isn't on a `varies` deadline; `required` that isn't a boolean
- a deadline with an unknown `kind`; a `hard`/`priority` deadline without a valid date; a `varies`/`from_letter` deadline with a date
- a `last_verified` that isn't a `YYYY-MM-DD` date
- `signals`, `signals_yes`/`signals_no`, `ignore_if_after`, or `routing_signals` that isn't a list of non-empty phrases;
  `signals_yes`/`signals_no` on a fact that isn't `bool`
- in `verified` packs: a step missing `source_text`, `source_url`, or `last_verified`, or a dated deadline missing `source_url` or `last_verified`

**Warnings (printed, app still runs):**
- the same in a `draft` pack
- `last_verified` older than 60 days
- a document or deadline that no step uses
- the same signal phrase listed twice in one fact (e.g. on two options)

**Not checked yet** (added to SCHEMA after the validator was written — add the checks
and their tests before the schema is locked):
- `cycle` has valid `starts` ≤ `ends` dates; a warning when today is outside the cycle
- `notices`: id, `applies_if` rule, `message` text, `stop_plan` is a boolean
- `done_if` is a valid rule
- `from_fact` names a fact of type `date`; `offset_days` and `repeat_months` are positive whole numbers;
  `from_fact`/`offset_days` only on `from_letter` deadlines
- `if_missed` is text
