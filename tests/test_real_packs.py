"""Every real pack in packs/ must load with zero errors.

This runs on every `make test`, so a typo in a pack (a misspelled step id, a bad
date, a rule using a value that isn't an option) fails the tests right away.
Draft packs may still have warnings; see them with `make check-packs`.
"""

from pathlib import Path

import pytest

from engine.pack_loader import load_pack

PACKS_DIR = Path(__file__).resolve().parent.parent / "packs"
PACK_FILES = sorted(PACKS_DIR.glob("*.json"))


def test_there_is_at_least_one_pack():
    assert PACK_FILES, f"no packs found in {PACKS_DIR}"


@pytest.mark.parametrize("path", PACK_FILES, ids=lambda p: p.stem)
def test_pack_loads_without_errors(path):
    load_pack(path)
