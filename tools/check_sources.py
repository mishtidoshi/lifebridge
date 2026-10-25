"""Check that every quote in the packs still appears on its official page.

    python tools/check_sources.py              # all packs
    python tools/check_sources.py medicaid     # one pack

For each step (and each pack's why_it_matters and help options) with source_text and
source_url, it downloads the page and looks for the quote. Quotes may skip text with
" ... "; each piece is looked for separately. Results:

    ok        every piece of the quote is on the page
    CHANGED   the page loaded, but part of the quote isn't there anymore: re-check the step
    blocked   the site blocks scripts (bot check); check it by hand in a browser
    pdf       a PDF; check it by hand (this tool only reads web pages)
    failed    the page didn't load, or needs JavaScript to show its text; check it by hand

When the live page can't be read (blocked, pdf, failed), the quote is checked against the
dated copy in packs/sources/copies/ instead, if there is one: "ok (copy)" or "CHANGED (copy)".
A copy only proves the quote matched on the day it was saved, so re-check those pages by hand.

Nothing is changed. Exit code 1 if any quote CHANGED, so it can run before a release.
Pages are downloaded with curl (installed on Mac and most Linux).
"""

import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIN_PAGE_CHARS = 1500
BLOCK_MARKERS = ("Incapsula", "Performing security verification", "think that you are a bot", "Request unsuccessful")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"


def squash(s):
    """Lowercase, curly quotes and dashes made plain, all whitespace one space: so small formatting changes don't count."""
    s = html.unescape(s).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace(" ", " ")
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"([/-]) ", r"\1", s)  # PDF line breaks: "business/ trade", "open- admission"
    return re.sub(r" ([.,;:!?])", r"\1", s).strip().lower()  # "warnings ?" on a page → "warnings?"


def page_text(url):
    raw = subprocess.run(["curl", "-sL", "-m", "40", "-A", UA, url], capture_output=True, text=True, errors="ignore").stdout
    raw = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw)
    return squash(re.sub(r"<[^>]+>", " ", raw)), raw


def quotes(pack):
    """(where, url, quote) for everything in the pack that cites a page."""
    for step in pack["steps"]:
        if step.get("source_text") and step.get("source_url"):
            yield f"step {step['id']}", step["source_url"], step["source_text"]
    why = pack.get("why_it_matters") or {}
    if why.get("source_text") and why.get("source_url"):
        yield "why_it_matters", why["source_url"], why["source_text"]
    for option in pack.get("help", []):
        if option.get("source_text") and option.get("source_url"):
            yield f"help {option['id']}", option["source_url"], option["source_text"]


COPIES = ROOT / "packs" / "sources" / "copies"


def in_text(text, quote):
    pieces = [squash(p) for p in re.split(r"\s*\.\.\.\s*", quote) if p.strip()]
    return all(p in text for p in pieces)


def check_copy(url, quote):
    index_file = COPIES / "index.json"
    if not index_file.exists():
        return None
    entry = json.loads(index_file.read_text()).get(url)
    if not entry:
        return None
    text = squash((COPIES / entry["file"]).read_text(encoding="utf-8"))
    return "ok (copy)" if in_text(text, quote) else "CHANGED (copy)"


def check(url, quote, cache):
    live = check_live(url, quote, cache)
    if live in ("blocked", "pdf", "failed"):
        return check_copy(url, quote) or live
    return live


def check_live(url, quote, cache):
    if url.lower().endswith(".pdf"):
        return "pdf"
    if url not in cache:
        cache[url] = page_text(url)
    text, raw = cache[url]
    if any(marker in raw for marker in BLOCK_MARKERS):
        return "blocked"
    if len(text) < MIN_PAGE_CHARS:
        return "failed"  # almost empty: the page needs JavaScript or blocked us
    return "ok" if in_text(text, quote) else "CHANGED"


def main(pack_ids):
    cache, counts, changed = {}, {}, []
    for path in sorted((ROOT / "packs").glob("*.json")):
        pack = json.loads(path.read_text(encoding="utf-8"))
        if pack_ids and pack["id"] not in pack_ids:
            continue
        print(f"\n{pack['id']}")
        for where, url, quote in quotes(pack):
            result = check(url, quote, cache)
            counts[result] = counts.get(result, 0) + 1
            if not result.startswith("ok"):
                print(f"  {result:8} {where}  {url}")
            if result.startswith("CHANGED"):
                changed.append(where)
    print("\n" + ", ".join(f"{n} {k}" for k, n in sorted(counts.items())))
    return 1 if changed else 0


if __name__ == "__main__":
    sys.exit(main(set(sys.argv[1:])))
