PY = .venv/bin/python

# Run all tests. Do this before and after every change.
test:
	$(PY) -m pytest

# Tests plus a report of which engine lines no test runs.
cov:
	$(PY) -m pytest --cov=engine --cov-report=term-missing

# Show every error and warning in every pack (e.g., missing sources in drafts).
check-packs:
	$(PY) -m engine.pack_loader

# Python API on port 8787. --host 0.0.0.0 lets a phone on the same Wi-Fi reach it.
api:
	$(PY) -m uvicorn app:app --reload --host 0.0.0.0 --port 8787

# The React Native app (Expo). Scan the QR code with Expo Go, or press w for the web version.
app:
	cd mobile && npx expo start

# Web build, served by the API at http://localhost:8787 (for deploying as one server).
web-build:
	cd mobile && npx expo export --platform web

# Typecheck + lint the app.
app-check:
	cd mobile && npx tsc --noEmit && npx expo lint

.PHONY: test cov check-packs api app web-build app-check
