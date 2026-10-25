"""Plan: put Match and Sequence together into everything the plan screen shows.

build_plan(pack, facts, today) returns plain JSON-ready data:
notices, "Do this next", the ordered steps with "why this applies", one combined
document checklist, the deadline timeline, and the "answer N quick questions" box.

This module never decides which steps apply or in what order. Match and
Sequence do that; this module only explains and formats their answers.
"""

import calendar
import datetime

from engine.facts import answer_label, answered_not_sure, fact_defs, facts_for_rules, known_value, text

SOON_DAYS = 14


class EngineNotReady(Exception):
    """engine/match.py or engine/sequence.py hasn't been written yet."""


def _engine():
    try:
        from engine.match import evaluate_rule, match_steps
        from engine.sequence import order_steps
    except ImportError as exc:
        raise EngineNotReady(f"The rules engine isn't finished yet ({exc}).") from exc
    return evaluate_rule, match_steps, order_steps


# --- "Why this applies" -----------------------------------------------------

def rule_fact_ids(rule):
    """Every fact id a rule mentions, in the order it first appears."""
    found = []

    def walk(r):
        if not isinstance(r, dict):
            return
        if "fact" in r and r["fact"] not in found:
            found.append(r["fact"])
        for part in r.get("all", []) + r.get("any", []):
            walk(part)
        if "not" in r:
            walk(r["not"])

    walk(rule)
    return found


def why_text(rule, facts, pack):
    """Sentences like "Where is the student right now? You said: High school senior"."""
    if rule.get("always"):
        return ["This step is part of the plan for everyone in this situation."]
    defs = fact_defs(pack)
    reasons = []
    for fact_id in rule_fact_ids(rule):
        fact = defs[fact_id]
        value = known_value(fact, facts)
        if value is not None:
            reasons.append(f"{text(fact['question'])} You said: {answer_label(fact, value)}")
    return reasons


def unknown_fact_ids(rule, facts, pack):
    """Facts a rule needs that the user hasn't answered (or answered "Not sure")."""
    defs = fact_defs(pack)
    return [f for f in rule_fact_ids(rule) if known_value(defs[f], facts) is None]


# --- Deadlines --------------------------------------------------------------

def add_months(day, months):
    """Same day of the month, `months` later (clamped to the month's last day)."""
    month_index = day.month - 1 + months
    year, month = day.year + month_index // 12, month_index % 12 + 1
    return datetime.date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def deadline_date(deadline, facts, today):
    """The date this deadline falls on for this user, or None if the user must enter it."""
    base = None
    if deadline.get("date"):
        base = datetime.date.fromisoformat(deadline["date"])
    elif deadline.get("from_fact") and facts.get(deadline["from_fact"]):
        base = datetime.date.fromisoformat(facts[deadline["from_fact"]])
        base += datetime.timedelta(days=deadline.get("offset_days", 0))
    if base is None:
        return None
    repeat = deadline.get("repeat_months")
    if repeat:
        first, n = base, 0
        while base < today:  # next upcoming repeat, counted from the first date to avoid drift
            n += 1
            base = add_months(first, n * repeat)
    return base


def deadline_status(day, today):
    if day is None:
        return "needs_date"
    if day < today:
        return "passed"
    if (day - today).days <= SOON_DAYS:
        return "soon"
    return "upcoming"


def cycle_warning(pack, today):
    cycle = pack.get("cycle")
    if not cycle:
        return None
    starts = datetime.date.fromisoformat(cycle["starts"])
    ends = datetime.date.fromisoformat(cycle["ends"])
    if starts <= today <= ends:
        return None
    return (f"This plan covers the {text(cycle['label'])}, and today is outside it. "
            "Some dates and steps may be out of date. Check the official sources.")


# --- The whole plan ---------------------------------------------------------

def build_plan(pack, facts, today):
    evaluate_rule, match_steps, order_steps = _engine()
    defs = fact_defs(pack)
    shown_facts, facts = facts, facts_for_rules(pack, facts)  # rules never see a yes/no "not_sure"
    not_sure = answered_not_sure(pack, shown_facts)

    notices = [
        {"id": n["id"], "message": text(n["message"]), "source_url": n.get("source_url"),
         "stop_plan": bool(n.get("stop_plan"))}
        for n in pack.get("notices", [])
        if evaluate_rule(n["applies_if"], facts, pack) == "yes"
    ]
    stopped = any(n["stop_plan"] for n in notices)

    matched = {} if stopped else match_steps(pack, facts)
    order = order_steps(pack, matched, today) if matched else []

    steps_by_id = {s["id"]: s for s in pack["steps"]}
    doc_applies = {
        d["id"]: evaluate_rule(d["applies_if"], facts, pack) if "applies_if" in d else "yes"
        for d in pack["documents"]
    }

    steps = []
    for step_id in order:
        step = steps_by_id[step_id]
        done_if = step.get("done_if")
        steps.append({
            "id": step_id,
            "title": text(step["title"]),
            "match": matched[step_id],  # "yes" or "unknown" ("May apply — check this")
            "done_at_start": bool(done_if) and evaluate_rule(done_if, facts, pack) == "yes",
            "why": why_text(step["applies_if"], facts, pack),
            "unknown_facts": unknown_fact_ids(step["applies_if"], facts, pack) if matched[step_id] == "unknown" else [],
            "depends_on": [d for d in step["depends_on"] if d in matched],
            "documents": [d for d in step["documents"] if doc_applies[d] != "no"],
            "deadlines": list(step["deadlines"]),
            "where": step.get("where"),
            "plain_explanation": text(step["plain_explanation"]),
            "source_text": text(step.get("source_text") or ""),
            "source_url": step.get("source_url"),
            "last_verified": step.get("last_verified"),
            "estimated_time": step.get("estimated_time"),
            # "How this plan was made" (SCHEMA.md §9)
            "judgment": bool(step.get("judgment")),
            "ai_drafted": bool(step.get("ai_drafted")),
            "review_status": step.get("review_status", "draft"),
            "verified_by": step.get("verified_by"),
        })

    next_step = next((s["id"] for s in steps if not s["done_at_start"]), None)

    documents = []
    for doc in pack["documents"]:
        used_by = [s["id"] for s in steps if doc["id"] in s["documents"]]
        if not used_by:
            continue
        documents.append({
            "id": doc["id"], "name": text(doc["name"]), "who": text(doc.get("who") or ""),
            "note": text(doc.get("note") or ""), "may_apply": doc_applies[doc["id"]] == "unknown",
            "used_by": used_by,
        })

    deadlines = []
    for dl in pack["deadlines"]:
        used_by = [s["id"] for s in steps if dl["id"] in s["deadlines"]]
        if not used_by:
            continue
        day = deadline_date(dl, facts, today)
        status = deadline_status(day, today)
        deadlines.append({
            "id": dl["id"], "label": text(dl["label"]), "kind": dl["kind"], "asap": bool(dl.get("asap")),
            "date": day.isoformat() if day else None, "status": status,
            "note": text(dl.get("note") or ""),
            "if_missed": text(dl.get("if_missed") or "") if status == "passed" else "",
            "source_url": dl.get("source_url"), "last_verified": dl.get("last_verified"),
            "used_by": used_by,
        })
    # "As soon as possible" first (most urgent), then by date, then ones the user still has to look up.
    deadlines.sort(key=lambda d: (not d["asap"], d["date"] is None, d["date"] or ""))

    settles = {}
    for s in steps:
        for fact_id in s["unknown_facts"]:
            if fact_id not in not_sure:  # already answered "Not sure": don't ask again
                settles.setdefault(fact_id, []).append(s["id"])
    questions = [
        {"fact_id": f["id"], "question": text(f["question"]), "settles": settles[f["id"]]}
        for f in pack["facts"] if f["id"] in settles
    ]
    # Most important first: the question that settles the most "May apply" steps (ties keep pack order).
    questions.sort(key=lambda q: -len(q["settles"]))

    why = pack.get("why_it_matters")
    why_it_matters = None if not why else {
        "text": text(why["text"]), "source_url": why.get("source_url"), "last_verified": why.get("last_verified"),
    }
    # "Still stuck?": the help options that may apply to this person (a "no" rule hides one).
    help_options = [
        {
            "id": h["id"], "title": text(h["title"]), "text": text(h["text"]), "where": h.get("where"),
            "prepare": [text(x) for x in h.get("prepare", [])],
            "source_url": h.get("source_url"), "last_verified": h.get("last_verified"),
        }
        for h in pack.get("help", [])
        if evaluate_rule(h.get("applies_if", {"always": True}), facts, pack) != "no"
    ]

    return {
        "pack": {"id": pack["id"], "title": text(pack["title"]), "status": pack["status"]},
        "why_it_matters": why_it_matters,
        "help": help_options,
        "today": today.isoformat(),
        "cycle_warning": cycle_warning(pack, today),
        "notices": notices,
        "stopped": stopped,
        "next_step": next_step,
        "steps": steps,
        "documents": documents,
        "deadlines": deadlines,
        "questions": questions,
        "facts_used": {k: v for k, v in shown_facts.items() if k in defs},
    }
