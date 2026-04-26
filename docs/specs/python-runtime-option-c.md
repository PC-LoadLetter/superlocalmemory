# Python Runtime Option C Spec (Managed venv default + explicit system opt-in)

Status: Active
Owner: Runtime / Installer track
Last updated: 2026-04-26

## 1) Goal

Adopt **Option C** for npm installations:

- Default to a managed Python virtual environment under `~/.superlocalmemory/venv`.
- Allow `system_python` only via explicit opt-in.
- Persist interpreter/runtime metadata and prefer it at runtime.

This improves determinism while preserving compatibility for edge environments.

## 2) Non-goals

- No changes to memory DB schema.
- No broad setup wizard redesign.
- No forced migration that can destroy user data.

## 3) Acceptance criteria

A change set for this track is complete only when all are true:

1. Fresh npm install with Python 3.11+ creates/uses managed venv by default.
2. Runtime metadata is written to `~/.superlocalmemory/python-runtime.json`.
3. All launchers (`slm-npm`, `slm`, `slm.bat`) honor pinned metadata before discovery fallback.
4. Explicit system mode opt-in works and is reflected in metadata.
5. Migration path from legacy installs is deterministic and non-destructive.
6. User-facing docs and version requirements are consistent (`>=3.11`).

## 4) Milestones

### M1 — Runtime helper + postinstall bootstrap

- [x] Add shared runtime helper (`scripts/python_runtime.js`) for:
  - Python discovery + minimum version validation
  - managed venv provisioning
  - runtime metadata read/write/resolve
- [x] Wire npm postinstall to use helper and write metadata
- [x] Add focused helper tests

### M2 — Launcher parity (pinned interpreter first)

- [x] M2.1 `bin/slm-npm` uses metadata-pinned interpreter before fallback
- [ ] M2.2 `bin/slm` (POSIX shell) uses metadata-pinned interpreter before fallback
- [ ] M2.3 `bin/slm.bat` / `bin/slm.cmd` (Windows) use metadata-pinned interpreter before fallback

### M3 — Legacy migration and repair

- [ ] M3.1 Detect legacy state (missing metadata) and bootstrap managed mode
- [ ] M3.2 Add deterministic repair path for invalid/missing interpreter
- [ ] M3.3 Add migration tests for non-destructive behavior

### M4 — Docs/version consistency

- [ ] M4.1 Align docs to Python `>=3.11`
- [ ] M4.2 Document runtime metadata path + system opt-in behavior
- [ ] M4.3 Add troubleshooting for missing `venv` module on distro Python

## 5) Open issues / risk register

1. **Open gap: `bin/slm` drift risk**
   - Current state: `bin/slm` still does direct `python3/python` discovery.
   - Risk: runtime interpreter can diverge from postinstall-selected interpreter.
   - Tracking: Milestone M2.2.

2. **Open gap: Windows launcher parity**
   - Current state: `slm.bat` discovery path not yet metadata-aware.
   - Tracking: Milestone M2.3.

3. **System-mode fallback policy**
   - Current state: helper may fall back to system mode when managed venv cannot be created.
   - Decision needed: fail closed in strict non-interactive environments vs permissive fallback.
   - Tracking: M3 policy decision before GA.

## 6) Test strategy (TDD-first)

For each milestone:

1. Add/adjust contract tests first (red).
2. Implement minimal code to pass (green).
3. Refactor shared logic with tests still green.

Focused suites used in this track:

- Node tests: `tests/postinstall/test_python_runtime.js`
- Python launcher tests: `tests/test_binary/test_dispatcher_fallback.py`
- Existing postinstall validation tests: `tests/postinstall/test_postinstall_validation.js`

## 7) PR discipline / on-task guardrails

Each PR in this track must:

1. Reference milestone items in this spec (e.g., M2.2).
2. Update checkbox status in this spec.
3. Include only files required for that milestone.
4. Run focused tests and report exact commands + results.

This file is the source of truth for scope and progress.
