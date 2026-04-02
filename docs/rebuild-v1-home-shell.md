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

## Working Checklist

- [ ] Branch exists and is separate from the legacy app work
- [ ] `Phase-1` is confirmed as the reference baseline
- [ ] The legacy app is treated as read-only reference material
- [ ] V1 scope is frozen before UI implementation begins
- [ ] Only the home screen is changed in this phase
- [ ] No bottom navigation, Inbox/Settings, Fitness, or Nutrition changes are included
- [ ] The scope lock is checked before each rebuild commit

## Build Rule

Do not start implementing UI changes until this note is the agreed rebuild gate for Phase 0.
