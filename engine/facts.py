"""Facts: check what the user (or the AI) says about their situation against a pack.

Facts arrive from two places: the question form and the Understand step. Either
way, only fact ids the pack defines and only values those facts allow get
through. Everything else is dropped, so the rules never see a value they
weren't written for.
"""

import datetime

# "Not sure" for a yes/no or date fact. (Enum facts have their own "Not sure" option
# marked "means_unknown".) It counts as an answer, so the app stops asking, but the
# rules treat it as unknown, so related steps stay "May apply".
NOT_SURE = "not_sure"


def text(value):
    """Plain string from a text field ({"en": ..., "es": ...} → English for now)."""
    if isinstance(value, dict):
        return value.get("en", "")
    return value if isinstance(value, str) else ""


def fact_defs(pack):
    return {f["id"]: f for f in pack["facts"]}


def _option_values(fact):
    return [o["value"] for o in fact.get("options", [])]


def clean_facts(pack, raw):
    """Keep only valid facts. Returns (facts, dropped) where dropped lists what was removed and why."""
    defs = fact_defs(pack)
    facts, dropped = {}, []
    if not isinstance(raw, dict):
        return facts, ["facts must be an object"]
    for fact_id, value in raw.items():
        fact = defs.get(fact_id)
        if fact is None:
            dropped.append(f"unknown fact '{fact_id}'")
            continue
        if value is None:
            continue
        kind = fact["type"]
        if kind == "enum":
            ok = isinstance(value, str) and value in _option_values(fact)
        elif kind == "multi":
            ok = isinstance(value, list) and all(isinstance(v, str) and v in _option_values(fact) for v in value)
            if ok:
                value = [v for v in _option_values(fact) if v in value]  # pack order, no duplicates
        elif kind == "bool":
            ok = isinstance(value, bool) or value == NOT_SURE
        elif kind == "date":
            ok = isinstance(value, str) and (value == NOT_SURE or _is_iso_date(value))
        else:
            ok = False
        if ok:
            facts[fact_id] = value
        else:
            dropped.append(f"{fact_id}: {value!r} is not an allowed answer")
    return facts, dropped


def _is_iso_date(value):
    try:
        datetime.date.fromisoformat(value)
        return True
    except ValueError:
        return False


def known_value(fact, facts):
    """The fact's value, or None if it's unknown (not given, or a "Not sure" option)."""
    value = facts.get(fact["id"])
    if value is None or value == NOT_SURE and fact["type"] in ("bool", "date"):
        return None
    if fact["type"] == "enum":
        for opt in fact.get("options", []):
            if opt["value"] == value and opt.get("means_unknown"):
                return None
    return value


def answer_label(fact, value):
    """Human wording for a fact's value, e.g. "High school senior" or "UC, CSU"."""
    labels = {o["value"]: text(o["label"]) for o in fact.get("options", [])}
    if value == NOT_SURE and fact["type"] in ("bool", "date"):
        return "Not sure"
    if fact["type"] == "bool":
        return "Yes" if value else "No"
    if fact["type"] == "multi":
        return ", ".join(labels.get(v, v) for v in value) if value else "None of these"
    if fact["type"] == "enum":
        return labels.get(value, value)
    return str(value)


def answered_not_sure(pack, facts):
    """Fact ids the user answered "Not sure": answered (so don't ask again), but still unknown."""
    return {
        f["id"] for f in pack["facts"]
        if f["id"] in facts and facts[f["id"]] is not None and known_value(f, facts) is None
    }


def facts_for_rules(pack, facts):
    """Facts as the rules should see them: a yes/no or date "Not sure" is the same as no answer."""
    types = {f["id"]: f["type"] for f in pack["facts"]}
    return {k: v for k, v in facts.items() if not (v == NOT_SURE and types.get(k) in ("bool", "date"))}
