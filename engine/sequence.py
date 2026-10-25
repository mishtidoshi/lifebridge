"""Sequence: put the matched steps in order (SCHEMA.md §7).

Every step comes after the steps it depends on (Kahn's algorithm). When several
steps are ready at once, the most urgent goes first: earliest effective
deadline, then steps with no deadline, then the order in the pack file.
"""

import datetime


def _own_deadline(step, deadlines_by_id, today):
    """The step's earliest dated deadline that hasn't passed, or None."""
    dates = []
    for deadline_id in step["deadlines"]:
        deadline = deadlines_by_id[deadline_id]
        if deadline.get("date") is None:
            continue  # "varies" or "from a letter": the user types it in
        day = datetime.date.fromisoformat(deadline["date"])
        if day >= today:  # passed deadlines don't count; today still counts
            dates.append(day)
    return min(dates) if dates else None


def effective_deadlines(pack, matched, today):
    """Return {step_id: date or None}: the earliest deadline of the step or any step that depends on it."""
    deadlines_by_id = {d["id"]: d for d in pack["deadlines"]}
    steps = {s["id"]: s for s in pack["steps"] if s["id"] in matched}  # only steps in the plan

    # kids[x] = the steps that depend on x
    kids = {step_id: [] for step_id in steps}
    for step_id, step in steps.items():
        for dep in step["depends_on"]:
            if dep in steps:  # ignore steps that aren't in the plan
                kids[dep].append(step_id)

    memo = {}  # remember answers so each step is worked out once

    def eff(step_id):
        if step_id in memo:
            return memo[step_id]
        candidates = [_own_deadline(steps[step_id], deadlines_by_id, today)]
        for kid in kids[step_id]:
            candidates.append(eff(kid))  # urgency flows backward from later steps
        real = [d for d in candidates if d is not None]
        memo[step_id] = min(real) if real else None
        return memo[step_id]

    return {step_id: eff(step_id) for step_id in steps}


def order_steps(pack, matched, today):
    """Return the matched step ids in the order the user should do them."""
    eff = effective_deadlines(pack, matched, today)

    # Position of each step in the pack file, for the final tie-break.
    pack_index = {}
    for i, step in enumerate(pack["steps"]):
        pack_index[step["id"]] = i

    # What each matched step is still waiting for (only steps in the plan count).
    waiting = {}
    for step in pack["steps"]:
        if step["id"] in matched:
            waiting[step["id"]] = {d for d in step["depends_on"] if d in matched}

    def urgency(step_id):
        """Smaller = more urgent: dated steps first, then earliest date, then pack order."""
        deadline = eff[step_id]
        has_no_deadline = deadline is None
        date_or_far_future = deadline if deadline else datetime.date.max
        return (has_no_deadline, date_or_far_future, pack_index[step_id])

    ready = [step_id for step_id in waiting if len(waiting[step_id]) == 0]
    result = []

    while ready:
        best = min(ready, key=urgency)  # picked again every turn: new ready steps may be more urgent
        ready.remove(best)
        result.append(best)

        for step_id in waiting:  # cross `best` off everyone's list
            if best in waiting[step_id]:
                waiting[step_id].discard(best)
                if len(waiting[step_id]) == 0:
                    ready.append(step_id)

    return result
