"""Check every pack (or the ones named) against packs/SCHEMA.md and print each error and warning.

    python tools/validate_pack.py
    python tools/validate_pack.py packs/medicaid.json

The app runs the same checks at startup and refuses to start with a broken pack.
Exit code 1 if any pack has errors.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from engine.pack_loader import PackError, load_pack, validate_pack  # noqa: E402


def main(paths):
    failed = False
    for path in paths or sorted((ROOT / "packs").glob("*.json")):
        path = Path(path)
        try:
            pack = load_pack(path)
        except PackError as exc:
            print(f"✗ {exc}\n")
            failed = True
            continue
        result = validate_pack(pack)
        steps = pack["steps"]
        reviewed = sum(1 for s in steps if s.get("review_status") == "verified")
        sourced = sum(1 for s in steps if s.get("source_text") and s.get("last_verified"))
        judgment = sum(1 for s in steps if s.get("judgment"))
        print(f"✓ {path.name} ({pack['status']}): 0 errors, {len(result.warnings)} warning(s)")
        print(f"    {len(steps)} steps: {sourced} quote an official source, {judgment} are LifeBridge's advice, "
              f"{reviewed} reviewed by a person")
        for warning in result.warnings:
            print(f"    ! {warning}")
        print()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
