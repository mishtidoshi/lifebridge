"""Match: decide which steps apply to the user (SCHEMA.md §6).

Every rule gives one of three answers: "yes", "no", or "unknown" (a fact the
rule needs hasn't been answered, or was answered "Not sure"). Steps that are
"unknown" stay in the plan, marked "May apply — check this".
"""


def _value(fact_id, facts, pack):
    """The user's answer for a fact, or None if it counts as unknown."""
    if fact_id not in facts:
        return None
    value = facts[fact_id]
    if value is None:
        return None
    for fact in pack["facts"]:
        if fact["id"] == fact_id:
            if fact.get("type") == "enum":
                for option in fact.get("options", []):
                    if option.get("value") == value and option.get("means_unknown") is True:
                        return None
            break
    return value


def evaluate_rule(rule, facts, pack):
    """Return "yes", "no", or "unknown"."""
    if "always" in rule:
        return "yes"

    # Combiners hold other rules, so evaluate each part first (recursion).
    if "all" in rule:
        results = [evaluate_rule(part, facts, pack) for part in rule["all"]]
        if "no" in results:
            return "no"  # one requirement definitely fails
        if "unknown" in results:
            return "unknown"
        return "yes"
    if "any" in rule:
        results = [evaluate_rule(part, facts, pack) for part in rule["any"]]
        if "yes" in results:
            return "yes"  # one option definitely holds
        if "unknown" in results:
            return "unknown"
        return "no"
    if "not" in rule:
        result = evaluate_rule(rule["not"], facts, pack)
        if result == "yes":
            return "no"
        if result == "no":
            return "yes"
        return "unknown"

    if "fact" in rule:
        value = _value(rule.get("fact"), facts, pack)
        if value is None:
            return "unknown"
        if "eq" in rule:
            return "yes" if value == rule["eq"] else "no"
        if "in" in rule:
            return "yes" if value in rule["in"] else "no"
        if "has" in rule:
            return "yes" if rule["has"] in value else "no"
        if "has_any" in rule:
            return "yes" if any(item in value for item in rule["has_any"]) else "no"

    raise ValueError(f"Unknown rule: {rule!r}")  # the validator should have caught this


def match_steps(pack, facts):
    """Return {step_id: "yes" | "unknown"} for every step that isn't "no"."""
    matched = {}
    for step in pack["steps"]:
        result = evaluate_rule(step["applies_if"], facts, pack)
        if result != "no":
            matched[step["id"]] = result
    return matched
