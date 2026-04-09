# App In My Life — V1 Mobile Implementation Architecture

Based on the approved V1 blueprint. This document is the translation layer between the locked blueprint and the current React codebase. Do not redesign from this document.

---

## 1. Component Map

### Bottom Nav (locked — no changes)
`AppFrame.jsx → BottomNav`
4 tabs: Home, Calendar, Fitness, More. Already correct. Leave it alone.

### Top Nav
`AppFrame.jsx → Header.jsx`
- Inbox icon → opens `InboxSurface` (currently via `setActiveSurface('inbox')` in `AppShell`)
- Settings icon → opens `SettingsSurface` (currently via `setActiveSurface('settings')`)
- Both surfaces already exist in main.jsx. Structure is correct, content needs work (see Phase 3).

### Players / Overlays
Five blueprint overlays, current status:

| Overlay | File | Current mount point | Status |
|---|---|---|---|
| WorkoutPlayer | `components/WorkoutPlayer.jsx` | Inside `FitnessScreen` JSX (tab-local) | Needs promotion to global |
| FocusTimer | `components/FocusTimer.jsx` | Inside `HomeDashboard` JSX (tab-local) | Needs promotion to global |
| RoutinePlayer | `components/RoutinePlayer.jsx` | Inside `HomeDashboard` via `activeRoutine` local state | Needs promotion to global |
| QuickAdd | `components/QuickAddModal.jsx` | In `AppShell` return, outside `AppFrame` | Correct — keep |
| MorningCheckin | `components/MorningCheckinModal.jsx` | Built but NOT mounted anywhere | Needs mounting in `AppShell` |

All five players must render at the `AppShell` level (or above), not inside tab screens. This is the prerequisite for active-block conflict enforcement. `QuickAddModal` already does this correctly — the others need to follow the same pattern.

### Home Screen (`HomeDashboard` in main.jsx, line 309)
7 blueprint zones mapped to current code:

| Zone | Blueprint name | Current state |
|---|---|---|
| 1 | Top area | `home-status-strip` — exists, has readiness + tasks/calendar/fitness/nutrition summary |
| 2 | Active block | Missing — no current-execution indicator on Home |
| 3 | Today's workout card | Partially: referenced in schedule list, but no dedicated card with launch button |
| 4 | Task feed | `home-tasks-card` — exists, shows top 3 open tasks |
| 5 | Routine strip | `home-routines-card` — exists, lists all routines regardless of schedule |
| 6 | Focus launcher | `home-focus-card` — exists, embeds `FocusTimer` |
| 7 | Nutrition bar | Only shown as a 4-dot slot indicator in the status strip — needs lightweight bar zone |

Zone 2 (Active block) needs to be built. Zones 3, 5, and 7 need targeted changes. Zones 1, 4, and 6 are largely correct.

### Calendar Screen
Currently a shell placeholder (`CalendarScreen` in main.jsx). Not a current implementation target. Leave the shell.

### Fitness Screen (`FitnessScreen` in main.jsx, line 3648)
- Training subtab: already built — weekly plan, today's workout card, recovery, check-in
- Nutrition subtab: routes to `NutritionScreen` — already built

### More Screen (`MoreScreen` in main.jsx)
4 sections already wired: Habits, Insights, Finance, Maintenance. Leave as-is.

### Inbox Surface (`InboxSurface` in main.jsx, line 197)
Currently: read-only list of captured `inboxItems`. 
Blueprint model: Capture → Triage → Conversion.
This surface needs triage UI and conversion actions. See Phase 3.

---

## 2. State Ownership

### AppContext — add `activeBlock`
AppContext already owns: `focusSession`, `energyState`, `fitnessSettings`, `mealPrefs`, `quickAddOpen`, `showMorningCheckin`, `selectedDate`.

**Add one new field:**
```js
activeBlock: null | { type: 'focus' | 'workout' | 'routine', id: string | null }
```

This is the single source of truth for which execution block is running. Rules live here. Conflict logic lives here.

`focusSession` stays for its session details (taskLabel, durationMinutes, startedAt). Remove `focusSession.active` — derive it from `activeBlock.type === 'focus'` at render time instead. This eliminates duplication.

`activeWorkoutId` is currently local state in `AppShell` (main.jsx line 4534). This must move to AppContext as part of `activeBlock.id`. Once `activeBlock` exists, `activeWorkoutId` is just `activeBlock?.type === 'workout' ? activeBlock.id : null`.

`activeRoutine` is currently local state in `HomeDashboard` (line 313). Routine launch must go through `setActiveBlock`, not local state, so the player survives tab switches and conflict rules are enforced.

### TaskContext — no changes to shape
All domain data is correct: `tasks`, `meals`, `workouts`, `routines`, `habits`, `calendarItems`, `inboxItems`, `pantryItems`, `notes`, `notifications`.

**One small addition to `inboxItem`:** add `stage` field (see Data Model section). The normalizer needs updating.

### Local component state — keep where it belongs
These stay local:
- `WorkoutPlayer`: current segment index, notes input
- `RoutinePlayer`: current step index
- `FocusTimer`: countdown interval ref
- `QuickAddModal`: form field text
- `MorningCheckinModal`: already reads from AppContext directly
- `NutritionScreen`: meal input text, hydration tap count
- `FitnessScreen`: selected date key, daily check-in form values

---

## 3. Canonical Data Models

These are the locked shapes. Do not add fields without a concrete use.

### Task
```js
{
  id: string,
  title: string,
  notes: string,
  status: 'planned' | 'active' | 'done',
  priority: boolean,
  subtasks: [{ id: string, title: string, done: boolean }],
  createdAt: number,
}
```
Already correct in TaskContext. No changes.

### Focus Session
```js
// AppContext.focusSession — session detail only
{
  taskLabel: string,
  durationMinutes: number,
  startedAt: number | null,
}
// active is derived: activeBlock?.type === 'focus'
```
Remove `active: boolean` from `focusSession` once `activeBlock` is wired.

### Routine
```js
{
  id: string,
  name: string,
  type: 'morning' | 'evening' | 'custom',
  steps: RoutineStep[],
  scheduleDays: string[],   // ['Monday', 'Tuesday', ...]
  scheduleTime: string | null,  // 'HH:MM'
  lastCompleted: string | null,  // 'YYYY-MM-DD'
  createdAt: number,
}
```
Already correct in TaskContext. No changes.

### Routine Step
```js
{
  id: string,
  label: string,
  type: 'task' | 'habit' | 'focus' | 'custom',
  durationMinutes: number | null,
}
```
Already correct. No changes.

### Workout
The full shape lives in `TaskContext.createWorkout` and `workoutSystemState.js`. Key fields for UI:
```js
{
  id: string,
  name: string,
  type: 'hyrox' | 'run' | 'strength' | 'recovery',
  status: 'planned' | 'active' | 'completed' | 'skipped',
  scheduledDate: string | null,  // 'YYYY-MM-DD'
  plannedDate: string | null,
  duration: number,              // minutes
  exercises: Exercise[],
  content: { blocks: Block[], notes: string[] },
  workoutLog: WorkoutLog | null,
}
```
Already correct. Workout system files are stable. Do not touch them.

### Meal
```js
{
  id: string,
  name: string,
  tags: string[],   // includes 'slot:breakfast' | 'slot:lunch' | 'slot:dinner' | 'slot:snacks'
                    // and macro tags: 'protein' | 'carbs' | 'veg' | 'quick' | 'water' | 'planned'
  loggedAt: number,
}
```
Already correct. No changes. "Logged today" = `toDateKey(meal.loggedAt) === todayKey`.

### Inbox Item
Current shape is missing triage stage. Add one field:
```js
{
  id: string,
  text: string,
  note: string,
  createdAt: number,
  stage: 'capture' | 'triaged' | 'converted',  // ADD — default 'capture'
  module: null | 'task' | 'workout' | 'meal' | 'calendar' | 'note',  // 'fitness' → 'workout'
  scheduledDate: string | null,
}
```
Migration: existing items with `module === null` → `stage: 'capture'`. Items with `module !== null` → `stage: 'triaged'`. Update `normalizeInboxItem` in TaskContext.

---

## 4. Active Block Rules

**Rule: only one active execution block at a time.**
Priority order: focus > workout > routine.
Meals are not blocks. They are logs. Never block.

### State
```js
// AppContext
activeBlock: null | { type: 'focus' | 'workout' | 'routine', id: string | null }
```

### Transitions

**Starting focus (highest priority):**
- If `activeBlock.type === 'workout'`: pause workout (set workout.status back to 'planned', preserve workoutLog), clear activeBlock, then set new activeBlock focus.
- If `activeBlock.type === 'routine'`: close routine player (no state to preserve), then set activeBlock focus.
- If nothing active: set activeBlock `{ type: 'focus', id: null }`.

**Starting workout:**
- If `activeBlock.type === 'focus'`: show conflict message "Finish your focus session first." Do not start workout.
- If `activeBlock.type === 'routine'`: show conflict message. Do not start workout.
- If nothing active: set workout.status = 'active', set activeBlock `{ type: 'workout', id: workoutId }`.

**Starting routine:**
- If `activeBlock.type === 'focus'`: show conflict message. Do not start routine.
- If `activeBlock.type === 'workout'`: show conflict message. Do not start routine.
- If nothing active: set activeBlock `{ type: 'routine', id: routineId }`.

**Stopping any block:**
- Set `activeBlock = null`.
- Clean up domain state as needed (focus session details reset, workout log preserved, routine lastCompleted updated).

### Implementation
Add `setActiveBlock(next)` to AppContext. This function contains the conflict rules. Never set `activeBlock` directly from components — always go through `setActiveBlock`. This keeps conflict logic in one place.

### Rendering players
In `AppShell` return (main.jsx), render the global player based on `activeBlock`:
```jsx
// After AppFrame, before closing fragment
{activeBlock?.type === 'workout' && <WorkoutPlayer ... />}
{activeBlock?.type === 'routine' && <RoutinePlayer ... />}
{activeBlock?.type === 'focus' && <FocusTimer ... />}  // persistent overlay version
<MorningCheckinModal />  // already self-contained, just needs mounting
```
Remove `WorkoutPlayer` from inside `FitnessScreen`. Remove `FocusTimer` from inside `HomeDashboard`. Remove `RoutinePlayer` from inside `HomeDashboard`. These screens become display-only — they show state, but launch via `setActiveBlock`.

---

## 5. Reuse vs Refactor

### Reuse unchanged
- `AppFrame.jsx` — shell is correct
- `Header.jsx` — correct
- `WorkoutPlayer.jsx` — full-screen player works, just needs re-mounting point
- `FocusTimer.jsx` — timer works, needs re-mounting point + props adjustment
- `RoutinePlayer.jsx` — step flow works, needs re-mounting point
- `QuickAddModal.jsx` — already at correct level
- `MorningCheckinModal.jsx` — built correctly, just needs mounting in AppShell
- All UI primitives (`Card`, `SectionHeader`, `MetricBlock`, `ListRow`, etc.)
- `TaskContext.jsx` — all factory functions and normalizers are correct
- `ProfileContext.jsx` — fine as-is
- All workout system data files (`hyroxPlan.js`, `workoutSystemState.js`, `hubData.js`, etc.)
- `HomeDashboard` status strip, task card, schedule card (zones 1, 4 already correct)
- `FitnessScreen` Training subtab and `NutritionScreen` — both are built, leave them

### Targeted refactors (do these, in order)

**AppContext.jsx:**
- Add `activeBlock` state + `setActiveBlock` with conflict rules
- Remove `active` from `focusSession` default shape (derive from `activeBlock`)

**TaskContext.jsx:**
- Update `createInboxItem` default to include `stage: 'capture'`
- Update `normalizeInboxItem` to handle `stage` field + migrate `'fitness'` module → `'workout'`

**main.jsx — AppShell:**
- Move `activeWorkoutId` local state out; replace with `activeBlock` from AppContext
- Mount `MorningCheckinModal` in the `AppShell` return
- Promote WorkoutPlayer, FocusTimer (active-state), RoutinePlayer to AppShell level

**main.jsx — HomeDashboard:**
- Remove `activeRoutine` local state; launch routines via `setActiveBlock`
- Remove embedded `RoutinePlayer` and `FocusTimer` (they will render at AppShell level)
- Add Zone 2: active block indicator (show if `activeBlock !== null`)
- Add Zone 3: dedicated today's workout card with a Start button
- Fix Zone 5: filter routine strip to only show routines scheduled for today
- Add Zone 7: lightweight nutrition bar (meal slots + water count, already computed)

**main.jsx — InboxSurface:**
- Add triage stage UI (separate capture input from triage list)
- Add conversion actions per item (convert to task / workout / meal / calendar / note)
- Wire conversions to TaskContext factories

### Do not extract yet
Extracting `HomeDashboard`, `FitnessScreen`, `NutritionScreen` etc. to their own files is tempting but high-blast-radius. The closures in main.jsx depend on shared helpers defined above them. Extract only when actively rebuilding that screen end-to-end. Working in-place is safer for now.

---

## 6. Implementation Order

Work in small, testable steps. Each step leaves the app runnable.

### Step 1 — Add `activeBlock` to AppContext
- Add `activeBlock: null` state
- Add `setActiveBlock(next)` function with conflict rules written out in comments (even before rules are enforced)
- Export both from AppContext
- No UI changes yet. App still works exactly as before.

### Step 2 — Mount MorningCheckinModal
- Add `<MorningCheckinModal />` to `AppShell` return, alongside `QuickAddModal`
- Verify it renders when `setShowMorningCheckin(true)` is called
- One import, one line. Low risk.

### Step 3 — Promote WorkoutPlayer to AppShell level
- Remove `WorkoutPlayer` from inside `FitnessScreen` JSX
- Remove `activeWorkoutId` local state from `AppShell`; replace with `activeBlock` from AppContext
- Add `{activeBlock?.type === 'workout' && <WorkoutPlayer workout={activeWorkout} ... />}` to AppShell return
- Wire the Start Workout button in FitnessScreen to call `setActiveBlock({ type: 'workout', id })`
- Wire cancel/complete callbacks to call `setActiveBlock(null)` and update workout in TaskContext
- Verify workout starts, persists across tab changes, completes correctly

### Step 4 — Promote RoutinePlayer to AppShell level
- Remove `activeRoutine` local state from `HomeDashboard`
- Remove `RoutinePlayer` from HomeDashboard JSX
- Add `{activeBlock?.type === 'routine' && <RoutinePlayer ... />}` to AppShell return
- Derive active routine from `routines.find(r => r.id === activeBlock?.id)`
- Wire routine Start buttons to call `setActiveBlock({ type: 'routine', id: routine.id })`
- Wire `onClose` and `onComplete` to call `setActiveBlock(null)` and update `lastCompleted`
- Verify routine starts from Home, persists across tab switches, completes correctly

### Step 5 — Promote FocusTimer to AppShell level (active state only)
- FocusTimer in HomeDashboard's focus card stays for the idle/setup state (where user types task label and picks duration)
- When user hits Start, instead of setting `focusSession.active = true`, call `setActiveBlock({ type: 'focus', id: null })`
- Add `{activeBlock?.type === 'focus' && <FocusTimer session={focusSession} ... />}` to AppShell return as a persistent overlay
- The idle FocusTimer in Zone 6 only shows when `activeBlock?.type !== 'focus'`
- Verify focus timer starts, persists on Calendar/Fitness/More tabs, stops correctly

### Step 6 — Enforce active block conflict rules
- Implement `setActiveBlock` conflict logic in AppContext: focus blocks workout/routine, workout/routine conflict with focus
- Add a simple inline warning message in WorkoutPlayer's Start button area and RoutinePlayer's Start button area when there's a conflict
- Test all 6 transition combinations

### Step 7 — Fix Home Zone 2 (Active block indicator)
- If `activeBlock !== null`, show a compact status bar at the top of HomeDashboard
- Focus: task label + elapsed time, tap to scroll to focus card
- Workout: workout name, tap to open WorkoutPlayer
- Routine: routine name + current step, tap to open RoutinePlayer
- This is display-only — player rendering is handled at AppShell level

### Step 8 — Fix Home Zone 3 (Today's workout card)
- Add a dedicated workout card section to HomeDashboard between Zone 2 and Zone 4
- Re-use the existing `todayWorkoutCard` computed value (already in HomeDashboard)
- Show workout name, duration, type
- Add a "Start" button that calls `setActiveBlock({ type: 'workout', id })`
- Show "Done" or "Missed" pill when appropriate
- Remove the workout entry from the schedule card below (Zone 4 becomes purely calendar items)

### Step 9 — Fix Home Zone 5 (Routine strip — today only)
- Add a helper `isRoutineScheduledToday(routine, todayDayName)` that checks `routine.scheduleDays.includes(dayName)`
- Filter the routine strip to only show routines scheduled for today
- If none scheduled today, show an `EmptyState` in the routines card or hide the card entirely

### Step 10 — Fix Home Zone 7 (Nutrition bar)
- The 4-dot slot indicator already exists in Zone 1 (status strip)
- Add a dedicated lightweight nutrition section below the task feed
- Show: slots logged (B / L / D / S) + water count vs goal
- Use existing `mealSlotProgress` computed value + `mealPrefs.hydrationGoal`
- One card, minimal UI — this is not the full NutritionScreen

### Step 11 — Inbox triage + conversion
- Update `createInboxItem` and `normalizeInboxItem` in TaskContext to add `stage` field
- Add migration alias: `module === 'fitness'` → normalize to `module: 'workout'`
- Rebuild `InboxSurface` in main.jsx:
  - Top: capture input (already in `QuickAddModal`, but surface should also allow direct capture)
  - List: items with `stage: 'capture'` or `stage: 'triaged'`
  - Each item: tap to expand conversion options (task / workout / meal / calendar / note)
  - Convert to task: calls `createTask({ title: item.text })`, sets item.stage = 'converted'
  - Convert to calendar: calls `createCalendarItem({ title: item.text })`, same
  - Convert to workout: calls `createWorkout({ name: item.text })`, same
  - Convert to meal: calls `createMeal({ name: item.text })`, same
  - Convert to note: calls `createNote({ content: item.text })`, same
  - Converted items: show collapsed at bottom with "Converted" pill

---

## 7. Risks and Cautions

### Risk 1 — `focusSession.active` duplication
`focusSession.active` is currently the truth for focus state. Once `activeBlock` is added, two fields will claim the same truth. 

**Fix:** In Step 5, stop setting `focusSession.active`. Remove the field from the default shape. Update any checks of `focusSession.active` to `activeBlock?.type === 'focus'`. Do this in one commit — partial migration will cause silent bugs.

### Risk 2 — WorkoutPlayer props from two places
`WorkoutPlayer` currently receives `workout` from `FitnessScreen`'s internal state, which has computed segment data. When moved to AppShell, it will derive workout from `workouts.find(w => w.id === activeBlock?.id)`. Confirm the segment-building logic in `workoutPlayerModel.js` works from the raw workout record, not from internal FitnessScreen computed state.

### Risk 3 — `activeWorkoutId` local state in AppShell
`AppShell` initializes `activeWorkoutId` from `workouts.find(w => w.status === 'active')` on mount (line 4534). There's also a `useEffect` that syncs it (line 4546). When this moves into `activeBlock`, the sync logic must be preserved — any workout with `status: 'active'` in TaskContext must set `activeBlock` to match on mount. Otherwise a workout that was active before app reload will lose its active state.

### Risk 4 — main.jsx blast radius
`HomeDashboard`, `FitnessScreen`, and helpers all share closures in a 4,789-line file. Any prop change in the middle can cause subtle rendering bugs far from where the change was made. Prefer surgical edits — add a single zone, test, commit — over rewriting large blocks.

### Risk 5 — Routine strip shows all routines today
Currently `HomeDashboard` shows all routines with no schedule filtering. Adding the `isRoutineScheduledToday` filter in Step 9 will make seeded routines disappear for some users if their `scheduleDays` does not include today's day name. Verify the seeded routines in `buildDefaultState` have all 7 days set before deploying the filter.

### Risk 6 — Inbox `module` field migration
Existing persisted `inboxItems` in localStorage will have `module: 'fitness'`. The new canonical value is `module: 'workout'`. The `normalizeInboxItem` migration alias must be deployed before the conversion UI is built, or conversion actions that check `module === 'workout'` will miss legacy items.

### Risk 7 — FocusTimer in two places simultaneously
After Step 5, there will briefly be two FocusTimer instances: one in HomeDashboard's Zone 6 (idle setup state) and one at AppShell level (active state). They share `focusSession` from AppContext, but each has its own interval ref. Make sure the idle timer in Zone 6 never shows when `activeBlock.type === 'focus'` — guard with `{activeBlock?.type !== 'focus' && <FocusTimer ... />}`.

### Risk 8 — RoutinePlayer currently uses `createPortal`
`RoutinePlayer.jsx` already renders via `createPortal` to `document.body`. Moving it to AppShell will render it twice: once from `createPortal` inside its component and once from the AppShell mount point. Remove the `createPortal` call from `RoutinePlayer.jsx` when promoting it to AppShell — let AppShell own the placement.

---

*No product changes. No desktop design. No new features beyond the blueprint.*
