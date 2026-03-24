# HYROX V2 – Small PR Plan

Date: 2026-03-24

This plan breaks the V2 scope into intentionally small, reviewable pull requests that can be merged independently while preserving existing app behavior.

## Guardrails for all PRs

- Keep current `WEEKLY_TEMPLATES` behavior working while introducing full session detail payloads.
- Avoid cross-module regressions (Home/Finance/Inbox) by keeping HYROX changes isolated.
- Add migration-safe defaults so existing persisted users do not crash.
- Each PR should include at least one user-visible verification in HYROX screens.

---

## PR 1 — Session detail schema + seed data adapters

**Goal:** Introduce a normalized schema that can represent full exercise prescriptions (sets/reps/notes) while retaining compatibility with current session types.

**Scope**
- Add `sessionDetails` model (types/constants) with fields for:
  - `id`, `title`, `category`, `blocks[]`, optional `coachNotes[]`
  - exercise entries (`name`, `sets`, `reps`, `loadHint`, `notes`)
  - run entries (`distance`, `duration`, `effort`, `paceTarget`)
- Add lookup layer from existing schedule keys → session detail objects.
- Keep legacy fallback so missing detail resolves to current label behavior.

**Acceptance checks**
- No UI regressions in Weekly preview.
- Any scheduled day can return a detail payload (or safe fallback).

---

## PR 2 — Today workout-first card rendering full session content

**Goal:** Make Today primarily display concrete workout content instead of just template labels.

**Scope**
- Render exercise list with sets/reps/notes in Today card.
- Render run prescriptions with distance/time/effort/pace target fields.
- Keep existing non-workout cards intact.

**Acceptance checks**
- Opening Today on a scheduled day shows full exercise payload.
- Unscheduled day shows explicit empty state with next workout hint.

---

## PR 3 — Workout state machine + durable workout history

**Goal:** Logging writes both per-day status and immutable-ish history entries.

**Scope**
- Add status transitions: `planned -> in_progress -> done` and `planned -> skipped`.
- Add `workoutHistory` persistence with timestamped entries.
- Add minimal logger UI hooks from Today card (start, complete, skip).

**Acceptance checks**
- Logging actions update day status immediately.
- History entries persist across refresh.

---

## PR 4 — Set/run logging payloads and aggregates recalculation

**Goal:** Capture meaningful execution details and recalculate weekly summary metrics.

**Scope**
- For strength: log per-set reps/load.
- For run: log distance/duration/effort.
- Recompute weekly aggregates after each log change:
  - sessions completed
  - sessions missed
  - total training time

**Acceptance checks**
- Weekly mini summary updates after complete/skip actions.
- Logged details visible from history rows.

---

## PR 5 — Move/skip rescheduling reflected in weekly view

**Goal:** Make schedule adjustments visible in current and affected weeks.

**Scope**
- Add move-session action (day-to-day within a week, then cross-week optional).
- Preserve original source reference in metadata (`movedFrom`, `movedTo`).
- Weekly UI surfaces moved and skipped indicators.

**Acceptance checks**
- Moved sessions appear on destination day and are marked in origin day.
- Weekly preview reflects changes immediately.

---

## PR 6 — Hardening, migration, and QA pass

**Goal:** Stabilize persistence and edge cases before expanding to hydration/nutrition/recovery modules.

**Scope**
- Add persistence migration versioning for new HYROX state.
- Add reducer/unit coverage for transitions and aggregate calculations.
- Add manual QA checklist for:
  - stale local state
  - missing session detail fallback
  - schedule moves near week boundaries

**Acceptance checks**
- Existing users with old storage hydrate safely.
- Transition logic covered by tests.

---

## Suggested branch / PR naming

- `feat/hyrox-v2-pr1-session-details`
- `feat/hyrox-v2-pr2-today-workout-first`
- `feat/hyrox-v2-pr3-logging-status-history`
- `feat/hyrox-v2-pr4-logging-aggregates`
- `feat/hyrox-v2-pr5-move-skip-weekly-reflection`
- `chore/hyrox-v2-pr6-migration-hardening`

## Notes

- This sequence intentionally defers hydration/nutrition/recovery UI until core training execution reliability is in place.
- If needed, PR 1 can be split into **1a schema** and **1b seed mapping** for even smaller review windows.
