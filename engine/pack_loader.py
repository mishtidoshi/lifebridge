"""Load pathway packs and check them against packs/SCHEMA.md.

The validator never stops at the first problem: it collects every error and
warning so a pack author can fix them all in one pass. It also never crashes on
a badly shaped pack; shape problems are reported as errors.
"""

import datetime
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

SCHEMA_VERSION = 1
STATUSES = {"draft", "verified"}
FACT_TYPES = {"enum", "multi", "bool", "date"}
DEADLINE_KINDS = {"hard", "priority", "varies", "from_letter"}
DATED_KINDS = {"hard", "priority"}
SOURCE_FIELDS = ("source_text", "source_url", "last_verified")
MAX_VERIFIED_AGE_DAYS = 60

ID_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
VALUE_OPERATORS = {"eq", "in", "has", "has_any"}
MULTI_ONLY_OPERATORS = {"has", "has_any"}

_TOP_LEVEL = {
    "schema_version": int,
    "id": str,
    "title": "text",
    "summary": "text",
    "status": str,
    "region": str,
    "routing_hint": "text",
    "example_inputs": list,
    "facts": list,
    "documents": list,
    "deadlines": list,
    "steps": list,
}
_FACT = {"id": str, "question": "text", "type": str}
_DOCUMENT = {"id": str, "name": "text"}
_DEADLINE = {"id": str, "label": "text", "kind": str}
_STEP = {
    "id": str,
    "title": "text",
    "applies_if": dict,
    "depends_on": list,
    "documents": list,
    "deadlines": list,
    "plain_explanation": "text",
}


class PackError(Exception):
    """A pack has errors and can't be used."""


@dataclass
class ValidationResult:
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)


def _is_text(value):
    """Plain string, or {"en": ..., "es": ...} with at least English."""
    if isinstance(value, str):
        return value.strip() != ""
    if isinstance(value, dict):
        return all(isinstance(v, str) for v in value.values()) and bool(value.get("en", "").strip())
    return False


def _positive_int(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def _parse_date(value):
    if not isinstance(value, str):
        return None
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        return None


class _Validator:
    def __init__(self, pack, today):
        self.pack = pack
        self.today = today
        self.result = ValidationResult()
        self.verified = isinstance(pack, dict) and pack.get("status") == "verified"

    def error(self, msg):
        self.result.errors.append(msg)

    def warn(self, msg):
        self.result.warnings.append(msg)

    def missing_source(self, msg):
        """Missing official sources are fine while drafting, not once verified."""
        (self.error if self.verified else self.warn)(msg)

    # --- shape helpers ------------------------------------------------------

    def check_fields(self, obj, spec, where):
        """Report missing or wrongly typed required fields. Returns True if all are OK."""
        ok = True
        for name, kind in spec.items():
            if name not in obj:
                self.error(f"{where}: missing required field '{name}'")
                ok = False
            elif kind == "text":
                if not _is_text(obj[name]):
                    self.error(f"{where}: '{name}' must be non-empty text (or a translation object with 'en')")
                    ok = False
            elif not isinstance(obj[name], kind) or (kind is int and isinstance(obj[name], bool)):
                self.error(f"{where}: '{name}' must be a {kind.__name__}")
                ok = False
        return ok

    def items(self, section):
        """The well-formed items of a list section, keyed by id. Reports bad items and duplicates."""
        raw = self.pack.get(section)
        if not isinstance(raw, list):
            return {}
        found = {}
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                self.error(f"{section}[{i}]: must be an object")
                continue
            item_id = item.get("id")
            if not isinstance(item_id, str):
                self.error(f"{section}[{i}]: missing required field 'id'")
                continue
            if not ID_PATTERN.match(item_id):
                self.error(f"{section} '{item_id}': id must be snake_case (lowercase letters, digits, _)")
            if item_id in found:
                self.error(f"{section}: duplicate id '{item_id}'")
                continue
            found[item_id] = item
        return found

    # --- sections -----------------------------------------------------------

    def check_top_level(self):
        if not isinstance(self.pack, dict):
            self.error("pack must be a JSON object")
            return False
        self.check_fields(self.pack, _TOP_LEVEL, "pack")
        if "schema_version" in self.pack and self.pack["schema_version"] != SCHEMA_VERSION:
            self.error(f"pack: unsupported schema_version {self.pack['schema_version']!r} (expected {SCHEMA_VERSION})")
        if "status" in self.pack and self.pack["status"] not in STATUSES:
            self.error(f"pack: status must be one of {sorted(STATUSES)}, not {self.pack['status']!r}")
        if "routing_signals" in self.pack:
            self.check_phrases(self.pack["routing_signals"], "pack: routing_signals")
        examples = self.pack.get("example_inputs")
        if isinstance(examples, list) and (not examples or not all(_is_text(e) for e in examples)):
            self.error("pack: example_inputs must be a non-empty list of text")
        return True

    def check_facts(self):
        for fact_id, fact in self.facts.items():
            where = f"fact '{fact_id}'"
            self.check_fields(fact, _FACT, where)
            if fact.get("type") not in FACT_TYPES:
                self.error(f"{where}: type must be one of {sorted(FACT_TYPES)}")
            if fact.get("type") in ("enum", "multi"):
                options = fact.get("options")
                if not isinstance(options, list) or not options:
                    self.error(f"{where}: enum/multi facts need a non-empty 'options' list")
                    continue
                for opt in options:
                    if not (isinstance(opt, dict) and isinstance(opt.get("value"), str) and _is_text(opt.get("label"))):
                        self.error(f"{where}: each option needs a 'value' string and a 'label'")
                    elif "signals" in opt:
                        self.check_phrases(opt["signals"], f"{where} option '{opt['value']}': signals")
            for name in ("signals_yes", "signals_no"):
                if name in fact:
                    if fact.get("type") != "bool":
                        self.error(f"{where}: '{name}' only works on bool facts (use 'signals' on each option)")
                    else:
                        self.check_phrases(fact[name], f"{where}: {name}")
            if "required" in fact and not isinstance(fact["required"], bool):
                self.error(f"{where}: 'required' must be true or false")
            if "ignore_if_after" in fact:
                self.check_phrases(fact["ignore_if_after"], f"{where}: ignore_if_after")
            self.check_signal_conflicts(fact, where)

    def check_model_flags(self):
        for fact_id, fact in self.facts.items():
            if "model" in fact and not isinstance(fact["model"], bool):
                self.error(f"fact '{fact_id}': 'model' must be true/false")
            if "shared" in fact and not isinstance(fact["shared"], bool):
                self.error(f"fact '{fact_id}': 'shared' must be true/false")

    def check_phrases(self, phrases, where):
        if not isinstance(phrases, list) or not all(isinstance(p, str) and p.strip() for p in phrases):
            self.error(f"{where} must be a list of non-empty phrases")

    def check_signal_conflicts(self, fact, where):
        """Warn when one phrase points to two answers of the same fact (or is listed twice)."""
        from engine.understand import phrase_words  # same normalizing as the reader

        groups = [(o.get("value"), o.get("signals")) for o in fact.get("options", []) if isinstance(o, dict)]
        groups += [("yes", fact.get("signals_yes")), ("no", fact.get("signals_no"))]
        seen = {}
        for answer, phrases in groups:
            if not isinstance(phrases, list):
                continue
            for phrase in phrases:
                if not isinstance(phrase, str):
                    continue
                key = " ".join(phrase_words(phrase))
                if key in seen:
                    self.warn(f"{where}: signal {phrase!r} is listed twice ({seen[key]!r} and {answer!r})")
                else:
                    seen[key] = answer

    def check_documents(self):
        for doc_id, doc in self.documents.items():
            where = f"document '{doc_id}'"
            self.check_fields(doc, _DOCUMENT, where)
            if "applies_if" in doc:
                self.check_rule(doc["applies_if"], where)

    def check_deadlines(self):
        for dl_id, dl in self.deadlines.items():
            where = f"deadline '{dl_id}'"
            self.check_fields(dl, _DEADLINE, where)
            kind = dl.get("kind")
            if kind not in DEADLINE_KINDS:
                self.error(f"{where}: kind must be one of {sorted(DEADLINE_KINDS)}, not {kind!r}")
                continue
            date = dl.get("date")
            if kind in DATED_KINDS:
                if date is None:
                    self.error(f"{where}: a '{kind}' deadline needs a date (YYYY-MM-DD)")
                    continue
                if _parse_date(date) is None:
                    self.error(f"{where}: date must be YYYY-MM-DD, not {date!r}")
                    continue
                for name in ("source_url", "last_verified"):
                    if not dl.get(name):
                        self.missing_source(f"{where}: missing {name}")
                self.check_last_verified(dl, where)
            elif date is not None:
                self.error(f"{where}: a '{kind}' deadline must have date null (the user enters it)")
            if "asap" in dl and (not isinstance(dl["asap"], bool) or kind != "varies"):
                self.error(f"{where}: 'asap' must be true/false, and only on a 'varies' deadline")

    def check_steps(self):
        for step_id, step in self.steps.items():
            where = f"step '{step_id}'"
            self.check_fields(step, _STEP, where)
            if isinstance(step.get("applies_if"), dict):
                self.check_rule(step["applies_if"], where)
            for name, kind, known in (
                ("depends_on", "step", self.steps),
                ("documents", "document", self.documents),
                ("deadlines", "deadline", self.deadlines),
            ):
                refs = step.get(name)
                if not isinstance(refs, list):
                    continue
                for ref in refs:
                    if ref not in known:
                        self.error(f"{where}: unknown {kind} '{ref}' in {name}")
            if "judgment" in step and not isinstance(step["judgment"], bool):
                self.error(f"{where}: judgment must be true/false")
            if step.get("judgment"):
                continue  # LifeBridge's own advice, labeled as such in the app: no official source to cite
            if not _is_text(step.get("source_text")):
                self.missing_source(f"{where}: missing source_text")
            if not step.get("source_url"):
                self.missing_source(f"{where}: missing source_url")
            if step.get("last_verified") is None:
                self.missing_source(f"{where}: missing last_verified")
            else:
                self.check_last_verified(step, where)

    # --- optional sections (SCHEMA.md §1, §1a, §4, §9) ---------------------------

    def check_cycle(self):
        cycle = self.pack.get("cycle")
        if cycle is None:
            return
        if not isinstance(cycle, dict):
            self.error("pack: cycle must be an object")
            return
        if not _is_text(cycle.get("label")):
            self.error("pack: cycle needs a 'label'")
        starts, ends = _parse_date(cycle.get("starts")), _parse_date(cycle.get("ends"))
        if starts is None or ends is None:
            self.error("pack: cycle 'starts' and 'ends' must be YYYY-MM-DD dates")
        elif starts > ends:
            self.error("pack: cycle 'starts' must be on or before 'ends'")
        elif not starts <= self.today <= ends:
            self.warn(f"pack: today is outside the cycle ({starts} to {ends}); the plan will show an out-of-date warning")

    def check_notices(self):
        notices = self.pack.get("notices")
        if notices is None:
            return
        if not isinstance(notices, list):
            self.error("pack: notices must be a list")
            return
        seen = set()
        for i, notice in enumerate(notices):
            where = f"notice {i}"
            if not isinstance(notice, dict):
                self.error(f"{where}: must be an object")
                continue
            notice_id = notice.get("id")
            if not isinstance(notice_id, str) or not ID_PATTERN.match(notice_id):
                self.error(f"{where}: needs a snake_case 'id'")
            elif notice_id in seen:
                self.error(f"notices: duplicate id '{notice_id}'")
            else:
                seen.add(notice_id)
                where = f"notice '{notice_id}'"
            if not isinstance(notice.get("applies_if"), dict):
                self.error(f"{where}: missing required field 'applies_if'")
            else:
                self.check_rule(notice["applies_if"], where)
            if not _is_text(notice.get("message")):
                self.error(f"{where}: 'message' must be non-empty text")
            if "stop_plan" in notice and not isinstance(notice["stop_plan"], bool):
                self.error(f"{where}: 'stop_plan' must be true/false")

    def check_deadline_extras(self):
        for dl_id, dl in self.deadlines.items():
            where = f"deadline '{dl_id}'"
            if "from_fact" in dl:
                fact = self.facts.get(dl["from_fact"])
                if fact is None or fact.get("type") != "date":
                    self.error(f"{where}: from_fact must name a fact of type 'date'")
                if dl.get("kind") != "from_letter":
                    self.error(f"{where}: from_fact is only for 'from_letter' deadlines")
            if "offset_days" in dl:
                if not _positive_int(dl["offset_days"]):
                    self.error(f"{where}: offset_days must be a positive whole number")
                if "from_fact" not in dl:
                    self.error(f"{where}: offset_days needs from_fact")
            if "repeat_months" in dl and not _positive_int(dl["repeat_months"]):
                self.error(f"{where}: repeat_months must be a positive whole number")
            if "if_missed" in dl and not _is_text(dl["if_missed"]):
                self.error(f"{where}: if_missed must be text")

    def check_step_extras(self):
        help_ids = {h.get("id") for h in self.pack.get("help", []) if isinstance(h, dict)}
        for step_id, step in self.steps.items():
            where = f"step '{step_id}'"
            if "done_if" in step:
                if isinstance(step["done_if"], dict):
                    self.check_rule(step["done_if"], f"{where} done_if")
                else:
                    self.error(f"{where}: done_if must be a rule")
            if "ai_drafted" in step and not isinstance(step["ai_drafted"], bool):
                self.error(f"{where}: ai_drafted must be true/false")
            if "verified_by" in step and step["verified_by"] is not None and not _is_text(step["verified_by"]):
                self.error(f"{where}: verified_by must be the reviewer's initials, or null")
            review = step.get("review_status", "draft")
            if review not in STATUSES:
                self.error(f"{where}: review_status must be one of {sorted(STATUSES)}")
            elif review == "verified" and not step.get("verified_by"):
                self.error(f"{where}: a verified step needs verified_by")
            if self.verified and review != "verified":
                self.error(f"{where}: every step in a verified pack must be checked by a person (review_status 'verified')")
            for help_id in step.get("help", []):
                if help_id not in help_ids:
                    self.error(f"{where}: unknown help option '{help_id}'")

    def check_why_and_help(self):
        why = self.pack.get("why_it_matters")
        if why is not None:
            if not isinstance(why, dict) or not _is_text(why.get("text")):
                self.error("pack: why_it_matters needs 'text'")
            elif not why.get("source_url") or not _is_text(why.get("source_text")):
                self.missing_source("pack: why_it_matters needs source_url and source_text")
        helps = self.pack.get("help")
        if helps is None:
            return
        if not isinstance(helps, list):
            self.error("pack: help must be a list")
            return
        seen = set()
        for i, option in enumerate(helps):
            if not isinstance(option, dict) or not isinstance(option.get("id"), str):
                self.error(f"help {i}: needs an 'id'")
                continue
            where = f"help '{option['id']}'"
            if option["id"] in seen:
                self.error(f"help: duplicate id '{option['id']}'")
            seen.add(option["id"])
            for name in ("title", "text"):
                if not _is_text(option.get(name)):
                    self.error(f"{where}: '{name}' must be non-empty text")
            if "applies_if" in option:
                self.check_rule(option["applies_if"], where)
            prepare = option.get("prepare", [])
            if not isinstance(prepare, list) or not all(_is_text(x) for x in prepare):
                self.error(f"{where}: 'prepare' must be a list of text")
            if not option.get("source_url"):
                self.missing_source(f"{where}: missing source_url")

    def check_last_verified(self, obj, where):
        value = obj.get("last_verified")
        if value is None:
            return
        checked = _parse_date(value)
        if checked is None:
            self.error(f"{where}: last_verified must be YYYY-MM-DD, not {value!r}")
        elif (self.today - checked).days > MAX_VERIFIED_AGE_DAYS:
            self.warn(f"{where}: last_verified {value} is older than {MAX_VERIFIED_AGE_DAYS} days; re-check the source")

    # --- rules --------------------------------------------------------------

    def check_rule(self, rule, where):
        if not isinstance(rule, dict) or not rule:
            self.error(f"{where}: rule must be a non-empty object, not {rule!r}")
            return
        if "always" in rule:
            if rule != {"always": True}:
                self.error(f"{where}: use exactly {{\"always\": true}}")
            return
        for combiner in ("all", "any"):
            if combiner in rule:
                parts = rule[combiner]
                if len(rule) != 1 or not isinstance(parts, list) or not parts:
                    self.error(f"{where}: '{combiner}' must be the only key and hold a non-empty list of rules")
                    return
                for part in parts:
                    self.check_rule(part, where)
                return
        if "not" in rule:
            if len(rule) != 1:
                self.error(f"{where}: 'not' must be the only key in its rule")
                return
            self.check_rule(rule["not"], where)
            return
        self.check_fact_rule(rule, where)

    def check_fact_rule(self, rule, where):
        ops = [k for k in rule if k in VALUE_OPERATORS]
        extra = set(rule) - VALUE_OPERATORS - {"fact"}
        if "fact" not in rule or len(ops) != 1 or extra:
            self.error(f"{where}: rule {rule!r} needs 'fact' plus exactly one of {sorted(VALUE_OPERATORS)}")
            return
        fact_id, op = rule["fact"], ops[0]
        fact = self.facts.get(fact_id)
        if fact is None:
            self.error(f"{where}: rule uses unknown fact '{fact_id}'")
            return
        fact_type = fact.get("type")
        if op in MULTI_ONLY_OPERATORS and fact_type != "multi":
            self.error(f"{where}: '{op}' only works with multi facts, but '{fact_id}' is {fact_type!r}")
            return
        if fact_type == "multi" and op not in MULTI_ONLY_OPERATORS:
            self.error(f"{where}: multi fact '{fact_id}' needs 'has' or 'has_any', not '{op}'")
            return
        values = rule[op] if op in ("in", "has_any") else [rule[op]]
        if op in ("in", "has_any") and (not isinstance(rule[op], list) or not rule[op]):
            self.error(f"{where}: '{op}' needs a non-empty list")
            return
        if fact_type == "bool":
            for v in values:
                if not isinstance(v, bool):
                    self.error(f"{where}: bool fact '{fact_id}' must be compared with true/false, not {v!r}")
        elif fact_type in ("enum", "multi"):
            allowed = {o.get("value") for o in fact.get("options", []) if isinstance(o, dict)}
            for v in values:
                if v not in allowed:
                    self.error(f"{where}: {v!r} is not an option of fact '{fact_id}'")

    # --- whole-pack checks ----------------------------------------------------

    def check_cycles(self):
        """Kahn's algorithm: if some steps never become ready, they're in a cycle."""
        deps = {
            sid: {d for d in s.get("depends_on", []) if d in self.steps} if isinstance(s.get("depends_on"), list) else set()
            for sid, s in self.steps.items()
        }
        remaining = {sid: len(d) for sid, d in deps.items()}
        ready = [sid for sid, n in remaining.items() if n == 0]
        while ready:
            done = ready.pop()
            for sid, d in deps.items():
                if done in d:
                    remaining[sid] -= 1
                    if remaining[sid] == 0:
                        ready.append(sid)
        stuck = sorted(sid for sid, n in remaining.items() if n > 0)
        if stuck:
            self.error(f"dependency cycle among steps: {', '.join(stuck)}")

    def check_unused(self):
        used = {"documents": set(), "deadlines": set()}
        for step in self.steps.values():
            for name in used:
                if isinstance(step.get(name), list):
                    used[name].update(r for r in step[name] if isinstance(r, str))
        for doc_id in self.documents.keys() - used["documents"]:
            self.warn(f"document '{doc_id}' is not used by any step")
        for dl_id in self.deadlines.keys() - used["deadlines"]:
            self.warn(f"deadline '{dl_id}' is not used by any step")

    def run(self):
        if not self.check_top_level():
            return self.result
        self.facts = self.items("facts")
        self.documents = self.items("documents")
        self.deadlines = self.items("deadlines")
        self.steps = self.items("steps")
        self.check_facts()
        self.check_documents()
        self.check_deadlines()
        self.check_steps()
        self.check_cycles()
        self.check_unused()
        self.check_cycle()
        self.check_notices()
        self.check_deadline_extras()
        self.check_step_extras()
        self.check_why_and_help()
        self.check_model_flags()
        return self.result


def validate_pack(pack, today=None):
    """Check a pack (already parsed from JSON). Returns a ValidationResult."""
    return _Validator(pack, today or datetime.date.today()).run()


def load_pack(path, today=None):
    """Read and validate one pack file. Raises PackError listing every error."""
    path = Path(path)
    try:
        pack = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PackError(f"{path.name}: not valid JSON ({exc})") from exc
    result = validate_pack(pack, today=today)
    errors = list(result.errors)
    if isinstance(pack, dict) and pack.get("id") != path.stem:
        errors.append(f"pack id {pack.get('id')!r} must match the filename '{path.stem}'")
    if errors:
        raise PackError(f"{path.name} has {len(errors)} error(s):\n  - " + "\n  - ".join(errors))
    return pack


def load_all_packs(directory, today=None):
    """Load every *.json pack in a directory, keyed by pack id."""
    return {pack["id"]: pack for pack in (load_pack(p, today=today) for p in sorted(Path(directory).glob("*.json")))}


if __name__ == "__main__":
    # `python -m engine.pack_loader` — show every error and warning for every pack.
    import sys

    packs_dir = Path(__file__).resolve().parent.parent / "packs"
    failed = False
    for path in sorted(packs_dir.glob("*.json")):
        try:
            pack = load_pack(path)
        except PackError as exc:
            print(f"✗ {exc}\n")
            failed = True
            continue
        result = validate_pack(pack)
        print(f"✓ {path.name} ({pack['status']}): 0 errors, {len(result.warnings)} warning(s)")
        for w in result.warnings:
            print(f"    ! {w}")
        print()
    sys.exit(1 if failed else 0)
