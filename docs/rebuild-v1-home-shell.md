# Rebuild Phase 0: Setup and Safety

## Reference Baseline

- Current reference branch: `Phase-1`
- New working branch: `rebuild-v1-home-shell`
- Status of the existing app: reference only, do not edit the legacy app directly

## V1 Scope Freeze

### In Scope

- Rebuild the home screen only.
- Use a mobile-first layout.
- Keep exactly three cards:
  - Top tasks and focus
  - Today’s schedule
  - Progress snapshot

### Out of Scope

- Bottom navigation changes
- Moving Inbox or Settings
- Fitness changes
- Nutrition changes
- Broader shell or routing refactors
- Reworking other tabs before the home screen is complete

## Phase 1 Shell Contract

### Inbox

- Inbox is a full-page screen.
- Inbox stays reachable from the top-right header action.
- Inbox is not part of the bottom navigation.
- Quick Capture does not replace Inbox.
- Quick Capture submissions are routed into Inbox for later review, assignment, or conversion.

### Settings

- Settings is a full-page screen.
- Settings stays reachable from the top-right header action.
- Settings is not part of the bottom navigation.
- Settings remains a shell surface in Phase 1, not a deep settings rebuild.

### Quick Capture

- Quick Capture is a separate fast-entry popup or lightweight overlay.
- Quick Capture is only for fast entry in V1.
- Suggested V1 fields are `title` and an optional short note.
- Quick Capture feeds Inbox, which is where captured items are handled later.

## Working Checklist

- [ ] Branch exists and is separate from the legacy app work
- [ ] `Phase-1` is confirmed as the reference baseline
- [ ] The legacy app is treated as read-only reference material
- [ ] V1 scope is frozen before UI implementation begins
- [ ] Only shell-level surfaces are changed in this phase
- [ ] Inbox and Settings are full-page shell surfaces only
- [ ] Quick Capture remains separate from Inbox and routes into Inbox
- [ ] No bottom navigation, Fitness, or Nutrition changes are included
- [ ] The scope lock is checked before each rebuild commit

## Build Rule

Do not start implementing UI changes until this note is the agreed rebuild gate for Phase 0.
