import copy
import datetime

import pytest

# A tiny but complete pack. Tests copy it and change one thing to check that
# the validator catches exactly that problem.
_MINIMAL_PACK = {
    "schema_version": 1,
    "id": "sample",
    "title": "Sample situation",
    "summary": "A pack used only by tests.",
    "status": "draft",
    "region": "CA",
    "routing_hint": "Used only in tests.",
    "example_inputs": ["This is a test."],
    "facts": [
        {
            "id": "color",
            "question": "What color?",
            "type": "enum",
            "options": [
                {"value": "red", "label": "Red"},
                {"value": "blue", "label": "Blue"},
                {"value": "not_sure", "label": "Not sure", "means_unknown": True},
            ],
        },
        {"id": "has_pet", "question": "Do you have a pet?", "type": "bool"},
        {
            "id": "places",
            "question": "Which places?",
            "type": "multi",
            "options": [
                {"value": "home", "label": "Home"},
                {"value": "school", "label": "School"},
            ],
        },
    ],
    "documents": [
        {"id": "id_card", "name": "ID card", "applies_if": {"always": True}},
    ],
    "deadlines": [
        {
            "id": "big_day",
            "label": "Big day",
            "date": "2027-03-02",
            "kind": "hard",
            "source_url": "https://example.gov/",
            "last_verified": "2026-10-01",
        },
    ],
    "steps": [
        {
            "id": "first",
            "title": "Do the first thing",
            "applies_if": {"always": True},
            "depends_on": [],
            "documents": ["id_card"],
            "deadlines": [],
            "plain_explanation": "Do it.",
            "source_text": "Official text.",
            "source_url": "https://example.gov/first",
            "last_verified": "2026-10-01",
            "review_status": "verified",
            "verified_by": "MS",
        },
        {
            "id": "second",
            "title": "Do the second thing",
            "applies_if": {"fact": "color", "eq": "red"},
            "depends_on": ["first"],
            "documents": [],
            "deadlines": ["big_day"],
            "plain_explanation": "Then do this.",
            "source_text": "Official text.",
            "source_url": "https://example.gov/second",
            "last_verified": "2026-10-01",
            "review_status": "verified",
            "verified_by": "MS",
        },
    ],
}

# Fixed "today" so tests about old last_verified dates never depend on the real date.
TODAY = datetime.date(2026, 10, 4)


@pytest.fixture
def pack():
    """A fresh, valid copy of the minimal pack for each test."""
    return copy.deepcopy(_MINIMAL_PACK)


@pytest.fixture
def today():
    return TODAY
