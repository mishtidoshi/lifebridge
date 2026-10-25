"""Which questions to ask next, a few at a time, and only when the answer would change the plan.

For each question the user hasn't answered, the engine tries every possible answer and checks
whether any of them changes the plan: a step that appears or disappears, a "May apply" step that
gets settled, a step that counts as already done, a document added to the checklist, or a notice
that stops the plan. A question
whose answer can't change anything is never asked.

Questions are asked in waves, most important first:
    1. required questions, in a wave of their own (the plan can't be built without them, like the state)
    2. the rest, by how many steps their answer could change (more first)
    3. ties keep the pack's order
After each wave the app sends the new answers back and gets the next wave, until nothing left
would change the plan.

Like plan.py, this module never decides anything itself; it asks Match what each answer would do.
"""

from engine.facts import facts_for_rules
from engine.match import evaluate_rule, match_steps

WAVE_SIZE = 3


def _snapshot(pack, facts):
    """What the plan looks like for these answers: each step's match and done state, and any stop notice."""
    rules_facts = facts_for_rules(pack, facts)
    matched = match_steps(pack, rules_facts)
    steps = {}
    for step in pack["steps"]:
        if step["id"] not in matched:
            continue
        done = step.get("done_if") and evaluate_rule(step["done_if"], rules_facts, pack) == "yes"
        steps[step["id"]] = (matched[step["id"]], bool(done))
    # documents on the checklist (only those some step in the plan uses)
    used = {d for step in pack["steps"] if step["id"] in matched for d in step["documents"]}
    for doc in pack["documents"]:
        if doc["id"] in used:
            steps["doc:" + doc["id"]] = evaluate_rule(doc.get("applies_if", {"always": True}), rules_facts, pack)
    stops = tuple(
        n["id"] for n in pack.get("notices", [])
        if n.get("stop_plan") and evaluate_rule(n["applies_if"], rules_facts, pack) == "yes"
    )
    return steps, stops


def _possible_answers(fact):
    if fact["type"] == "enum":
        return [o["value"] for o in fact.get("options", []) if not o.get("means_unknown")]
    if fact["type"] == "bool":
        return [True, False]
    if fact["type"] == "multi":
        return [[]] + [[o["value"]] for o in fact.get("options", [])]
    return []  # dates are typed in on the plan, not asked here


def impact(pack, facts, fact, baseline=None):
    """How many steps (or checklist documents) could change with this answer (0 = not worth asking)."""
    base_steps, base_stops = baseline or _snapshot(pack, facts)
    changed, stops_change = set(), False
    for value in _possible_answers(fact):
        steps, stops = _snapshot(pack, {**facts, fact["id"]: value})
        for step_id in set(steps) | set(base_steps):
            if steps.get(step_id) != base_steps.get(step_id):
                changed.add(step_id)
        stops_change = stops_change or stops != base_stops
    return len(changed) + (100 if stops_change else 0)


def needed_questions(pack, facts, asked=()):
    """Every unanswered question that still matters, most important first.

    `asked` lists questions already shown and skipped: they aren't asked again.
    Returns [{"fact_id", "required", "impact", "reason"}].
    """
    asked = set(asked)
    baseline = _snapshot(pack, facts)
    out = []
    for index, fact in enumerate(pack["facts"]):
        if fact["id"] in facts or fact["id"] in asked or fact["type"] == "date":
            continue
        required = bool(fact.get("required"))
        score = impact(pack, facts, fact, baseline)
        if not required and score == 0:
            continue  # no answer would change the plan: don't ask
        if required:
            reason = "Your plan depends on this."
        elif score >= 100:
            reason = "This decides whether this plan fits you."
        else:
            reason = f"Your answer can change {score} part{'s' if score != 1 else ''} of your plan."
        out.append({"fact_id": fact["id"], "required": required, "impact": score, "reason": reason, "_order": index})
    out.sort(key=lambda q: (not q["required"], -q["impact"], q["_order"]))
    for q in out:
        del q["_order"]
    return out


def next_wave(pack, facts, asked=(), size=WAVE_SIZE):
    """The next few questions to ask, and how many more still matter after them.

    Required questions get a wave of their own: their answers (like the state, or "getting ready" vs
    "it already happened") often decide whether other questions matter at all, so those wait.
    """
    needed = needed_questions(pack, facts, asked)
    required = [q for q in needed if q["required"]]
    wave = required[:size] if required else needed[:size]
    return {"questions": wave, "remaining": len(needed) - len(wave), "done": not needed}
