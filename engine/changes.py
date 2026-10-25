"""What changed? Compare the plan before and after an update, and explain each difference.

When the user corrects an answer (or marks steps done), the engine rebuilds the plan from
scratch, so nothing is patched by hand. This module then compares the old and new plans:

    added        steps that now apply
    removed      steps that no longer apply
    confirmed    steps that went from "May apply" to "Applies"
    now_unsure   steps that went from "Applies" to "May apply"
    moved_up     steps that moved earlier in the order
    next         "Do this next" before and after, and why it changed

Every change gets a one-line reason built from the answers that changed and the step's rule,
so the user can see exactly which update caused it. Like plan.py, this module only explains:
Match and Sequence still decide what applies and in what order.
"""

from engine.facts import answer_label, fact_defs, known_value, text
from engine.plan import build_plan, rule_fact_ids

MAX_MOVED = 5  # only the biggest moves, so the summary stays short


def changed_fact_ids(pack, before, after):
    """Facts whose answer is different (including newly answered or cleared), in pack order."""
    return [f["id"] for f in pack["facts"] if before.get(f["id"]) != after.get(f["id"])]


def _describe(fact, facts):
    """'"Has a college asked you to verify…?" is now Yes' style text for one fact."""
    value = known_value(fact, facts)
    question = text(fact["question"]).rstrip("?")
    if value is None:
        return f'you cleared or aren\'t sure about "{question}"'
    return f'you answered "{question}": {answer_label(fact, value)}'


def _reason(step, changed, defs, facts, fallback):
    """Why one step changed: the changed answers its rule depends on."""
    used = [f for f in rule_fact_ids(step["applies_if"]) if f in changed]
    if not used:
        return fallback
    parts = [_describe(defs[f], facts) for f in used[:2]]
    reason = " and ".join(parts)
    return reason[0].upper() + reason[1:] + "."


def _next(plan, done):
    return next((s["id"] for s in plan["steps"] if not (s["done_at_start"] or s["id"] in done)), None)


def compare_plans(pack, facts_before, facts_after, today, done_before=(), done_after=()):
    """{"changed_facts", "added", "removed", "confirmed", "now_unsure", "moved_up", "next", "any"}."""
    before = build_plan(pack, facts_before, today)
    after = build_plan(pack, facts_after, today)
    done_before, done_after = set(done_before), set(done_after)

    defs = fact_defs(pack)
    pack_steps = {s["id"]: s for s in pack["steps"]}
    changed = changed_fact_ids(pack, facts_before, facts_after)
    old = {s["id"]: s for s in before["steps"]}
    new = {s["id"]: s for s in after["steps"]}

    def entry(step_id, reason):
        return {"step_id": step_id, "title": text(pack_steps[step_id]["title"]), "reason": reason}

    added = [entry(sid, _reason(pack_steps[sid], changed, defs, facts_after, "It now applies based on your answers."))
             for sid in new if sid not in old]
    removed = [entry(sid, _reason(pack_steps[sid], changed, defs, facts_after, "It no longer applies based on your answers."))
               for sid in old if sid not in new]
    confirmed = [entry(sid, _reason(pack_steps[sid], changed, defs, facts_after, "Your answers now settle it."))
                 for sid in new if sid in old and old[sid]["match"] == "unknown" and new[sid]["match"] == "yes"]
    now_unsure = [entry(sid, _reason(pack_steps[sid], changed, defs, facts_after, "An answer it depends on is now unknown."))
                  for sid in new if sid in old and old[sid]["match"] == "yes" and new[sid]["match"] == "unknown"]

    # Moved up: rank among the steps that are in both plans, so added/removed steps don't count as moves.
    common_old = [s for s in old if s in new]
    common_new = [s for s in new if s in old]
    moves = []
    for sid in common_new:
        up = common_old.index(sid) - common_new.index(sid)
        if up > 0:
            moves.append((up, sid))
    moves.sort(reverse=True)
    moved_up = [entry(sid, "Something it leads to now has an earlier deadline, or a step before it changed.")
                for _, sid in moves[:MAX_MOVED]]

    next_before, next_after = _next(before, done_before), _next(after, done_after)
    next_info = None
    if next_before != next_after:
        newly_done = done_after - done_before
        if next_before and next_before in done_after:
            title = text(pack_steps[next_before]["title"])
            why = (f'You marked "{title}" done.' if len(newly_done) <= 1
                   else f'You marked {len(newly_done)} steps done, including "{title}".')
        elif next_before and next_before not in new:
            why = f'"{text(pack_steps[next_before]["title"])}" no longer applies.'
        elif next_after and next_after not in old:
            why = "A new step applies, and it comes first."
        else:
            why = "The order changed after your update."
        next_info = {
            "before": next_before,
            "after": next_after,
            "title": text(pack_steps[next_after]["title"]) if next_after else None,
            "reason": why,
        }

    return {
        "changed_facts": changed,
        "added": added,
        "removed": removed,
        "confirmed": confirmed,
        "now_unsure": now_unsure,
        "moved_up": moved_up,
        "next": next_info,
        "any": bool(added or removed or confirmed or now_unsure or moved_up or next_info),
    }
