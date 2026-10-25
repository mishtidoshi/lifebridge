"""LifeBridge JSON API.

    GET  /api/packs              life-event cards for the home screen
    GET  /api/packs/{pack_id}    one pack's facts (for the question form and confirm screen)
    POST /api/understand         text → {pack_id, facts, evidence} for "Here's what I understood"
                                 (LifeBridge's own rule-based reader; no outside AI service)
    POST /api/questions          {pack_id, facts, asked} → the next few questions that would change the plan
    GET  /api/calendar/{pack_id}/{deadline_id}.ics[?date=YYYY-MM-DD]   one deadline for the user's calendar
    POST /api/plan               {pack_id, facts} → the full plan; with previous_facts, also "What changed?"

Nothing the user sends is saved or logged. Run with `make api`.
"""

import datetime
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

from engine import understand as understand_module
from engine.calendar_file import deadline_ics
from engine.changes import compare_plans
from engine.facts import clean_facts, text
from engine.pack_loader import load_all_packs
from engine.plan import EngineNotReady, build_plan
from engine.questions import next_wave

ROOT = Path(__file__).resolve().parent
PACKS = load_all_packs(ROOT / "packs")  # the validator runs here: a broken pack stops the app
WEB_BUILD = ROOT / "mobile" / "dist"

UNDERSTAND_LIMIT = 30  # requests per IP ...
UNDERSTAND_WINDOW = 60  # ... per this many seconds

app = FastAPI(title="LifeBridge", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


class RateLimiter:
    def __init__(self, limit, window):
        self.limit, self.window = limit, window
        self.hits = defaultdict(deque)
        self.lock = threading.Lock()

    def allow(self, key):
        now = time.monotonic()
        with self.lock:
            hits = self.hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


understand_limiter = RateLimiter(UNDERSTAND_LIMIT, UNDERSTAND_WINDOW)


def _get_pack(pack_id):
    pack = PACKS.get(pack_id)
    if pack is None:
        raise HTTPException(404, f"No pack called '{pack_id}'.")
    return pack


def _fact_for_client(fact):
    return {
        "id": fact["id"],
        "question": text(fact["question"]),
        "type": fact["type"],
        "options": [
            {"value": o["value"], "label": text(o["label"]), "means_unknown": bool(o.get("means_unknown"))}
            for o in fact.get("options", [])
        ],
        "ask_if_missing": bool(fact.get("ask_if_missing")),
        "required": bool(fact.get("required")),
        "sensitive": bool(fact.get("sensitive")),
        "shared": bool(fact.get("shared")),  # the same question in other topics: answer once, reuse it
    }


@app.get("/api/health")
def health():
    return {"ok": True, "packs": sorted(PACKS)}


@app.get("/api/packs")
def list_packs():
    return [
        {"id": p["id"], "title": text(p["title"]), "summary": text(p["summary"]),
         "icon": p.get("icon"), "status": p["status"]}
        for p in PACKS.values()
    ]


@app.get("/api/packs/{pack_id}")
def get_pack(pack_id: str):
    pack = _get_pack(pack_id)
    return {
        "id": pack["id"], "title": text(pack["title"]), "summary": text(pack["summary"]),
        "status": pack["status"], "cycle": pack.get("cycle"),
        "example_inputs": [text(e) for e in pack["example_inputs"]],
        "facts": [_fact_for_client(f) for f in pack["facts"]],
    }


class UnderstandRequest(BaseModel):
    text: str
    pack_id: str | None = None  # the life event the user picked; None = work it out from the text
    use_model: bool = True  # False = rules only (the fact models in engine/ml/ don't guess)


@app.post("/api/understand")
def understand(body: UnderstandRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not understand_limiter.allow(client_ip):
        raise HTTPException(429, "Too many requests. Wait a minute, or answer the questions instead.")
    if body.pack_id is not None:
        _get_pack(body.pack_id)
    try:
        return understand_module.understand(body.text, PACKS, pack_id=body.pack_id, use_model=body.use_model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


class PlanRequest(BaseModel):
    pack_id: str
    facts: dict[str, Any] = {}
    today: datetime.date | None = None  # for demos and tests; normally the server's date
    # For "What changed?": the answers the last plan was built from, and which steps were done
    # before and now (from the user's tracker). Used for this one answer only, never stored.
    previous_facts: dict[str, Any] | None = None
    previous_done: list[str] = []
    done_steps: list[str] = []


@app.post("/api/plan")
def plan(body: PlanRequest):
    pack = _get_pack(body.pack_id)
    facts, dropped = clean_facts(pack, body.facts)
    today = body.today or datetime.date.today()
    try:
        result = build_plan(pack, facts, today)
        if body.previous_facts is not None:
            before, _ = clean_facts(pack, body.previous_facts)
            result["changes"] = compare_plans(pack, before, facts, today, body.previous_done, body.done_steps)
        else:
            result["changes"] = None
    except EngineNotReady as exc:
        raise HTTPException(501, str(exc)) from None
    result["ignored_facts"] = dropped
    return result


class QuestionsRequest(BaseModel):
    pack_id: str
    facts: dict[str, Any] = {}
    asked: list[str] = []  # questions already shown and skipped: not asked again
    size: int = 3


@app.post("/api/questions")
def questions(body: QuestionsRequest):
    """The next wave of questions: only ones whose answer would change the plan, most important first."""
    pack = _get_pack(body.pack_id)
    facts, _ = clean_facts(pack, body.facts)
    return next_wave(pack, facts, body.asked, size=max(1, min(body.size, 10)))


@app.get("/api/calendar/{pack_id}/{deadline_id}.ics")
def calendar(pack_id: str, deadline_id: str, date: datetime.date | None = None):
    """A deadline as a calendar file. Dated deadlines use the official date; for ones the user
    types in (from a letter), pass ?date=. Only the date is sent, nothing about the person."""
    pack = _get_pack(pack_id)
    deadline = next((d for d in pack["deadlines"] if d["id"] == deadline_id), None)
    if deadline is None:
        raise HTTPException(404, f"No deadline called '{deadline_id}'.")
    day = datetime.date.fromisoformat(deadline["date"]) if deadline.get("date") else date
    if day is None:
        raise HTTPException(400, "This deadline depends on you. Add its date first.")
    return Response(
        deadline_ics(pack, deadline, day),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{deadline_id}.ics"'},
    )


class SinglePageApp(StaticFiles):
    """Serve the web build; any unknown path (like /financial_aid/plan after a reload) gets index.html."""

    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code != 404 or path.startswith("api"):
                raise
            return await super().get_response("index.html", scope)


# In production, the same server hosts the web build of the app (`make web-build`).
if WEB_BUILD.is_dir():
    app.mount("/", SinglePageApp(directory=WEB_BUILD, html=True), name="web")
