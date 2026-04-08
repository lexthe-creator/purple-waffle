# Mobile Screen Blueprint — V1

App in My Life · First implementation pass · Mobile-first

---

## Context

This document translates the approved product architecture into a practical interaction model for the first implementation pass. It defines screens, zones, object behaviors, and scope boundaries. No code is specified here — this is the handoff document for implementation.

Locked direction: Inbox = capture/triage, Home = daily execution, Calendar = schedule visibility, Fitness = training management, More = secondary systems, Settings = global controls.

---

## V1 Screen List

### Primary Tabs (Bottom Nav)
| Tab | Label |
|-----|-------|
| Home | Daily execution |
| Calendar | Schedule visibility |
| Fitness | Training management |
| More | Secondary systems |

### Top Nav Surfaces (full-page modal, not in bottom nav)
| Surface | Entry point |
|---------|-------------|
| Inbox | Top-right header icon + badge count |
| Settings | Top-right header icon |

### Overlay / Player Surfaces (launched from within tabs)
| Surface | Trigger |
|---------|---------|
| Workout Player | "Start Workout" tap |
| Focus Session | "Start Focus" tap from Home |
| Routine Player | "Start Routine" tap from Home |
| Quick Add Modal | FAB (+) button, any tab except Calendar |
| Morning Check-in Modal | Auto-triggered first Home visit of the day |

---

## Per-Screen Breakdown

### Home / Today

**Purpose:** Daily execution command center — shows what needs to happen today and enables acting on it without leaving the screen.

**Key sections:**
- **Top zone** — date, greeting, energy context after morning check-in
- **Active block** — live focus session, workout in progress, or routine in progress (conditional)
- **Today's workout card** — single workout for the day with launch action
- **Task feed** — today's prioritized task list
- **Routines** — scheduled routines for today
- **Focus launcher** — entry point for starting a focus session
- **Nutrition bar** — simple four-slot meal status

**Actions available:**
- Complete a task
- Start a focus session (launches FocusTimer overlay)
- Start a routine (launches RoutinePlayer modal)
- Launch today's workout (launches WorkoutPlayer full-screen)
- Skip or move a workout (with confirmation)
- Log a meal to a slot (tap → name entry)
- Open morning check-in if missed

**Must NOT live here:**
- Weekly calendar view or schedule browsing
- Workout history or program management
- Detailed nutrition logging, macro counts
- Finance, habits, insights
- Inbox triage
- Settings controls

---

### Calendar

**Purpose:** Time and schedule visibility — shows what is committed across days and enables placing new items.

**Key sections:**
- **Week strip** — horizontal day selector, scrollable by week
- **Day timeline** — time-blocked view for the selected date
- **Auto-written items** — workout blocks and routine blocks placed by the system, visually distinct from user-created events
- **Event detail** — tap any block to see title, time, type

**Actions available:**
- Navigate days and weeks
- Tap event to view detail
- Add a calendar event (opens QuickAdd modal, schedule tab)
- Navigate to Fitness from a workout block (does not execute from Calendar)

**Must NOT live here:**
- Task execution (belongs on Home)
- Workout execution (launches from Fitness or Home)
- Habit tracking
- Financial scheduling

---

### Fitness / Training (sub-tab: Training)

**Purpose:** Training management — see the workout schedule, manage the program, and launch workouts.

**Key sections:**
- **Missed workout banner** — appears at top if yesterday's workout was skipped, with auto-move confirmation
- **Today's workout card** — full exercise preview, session type, duration, program context
- **Weekly training strip** — day-by-day status (planned / completed / skipped / rest)
- **Program context row** — current program name, phase, week number
- **Recent history** — last 3–5 completed sessions

**Actions available:**
- Launch workout → opens WorkoutPlayer (full-screen)
- Skip today's workout (reason optional)
- Confirm or cancel auto-move of missed workout
- View completed session summary
- Swap session type (if program allows)

**Must NOT live here:**
- Nutrition (separate sub-tab)
- Task management
- Calendar scheduling (Calendar tab owns that)
- Program enrollment or switching (Settings handles it)

---

### Fitness / Nutrition (sub-tab: Nutrition)

**Purpose:** Hybrid nutrition management — simple daily logging in default view, expandable for detail and planning.

**Key sections:**
- **Daily meal slots** — Breakfast, Lunch, Dinner, Snack — logged or empty state per slot
- **Hydration counter** — simple increment/decrement against a daily goal
- **Expand: Nutrition detail** — toggleable panel showing meal history, tags, timestamps
- **Expand: Weekly plan** — collapsible view for weekly targets if configured

**Actions available:**
- Log a meal to a slot (tap slot → name entry → save)
- Mark slot as done without detail
- Increment/decrement hydration
- Expand for detail view
- Navigate to planning view

**Must NOT live here:**
- Calorie counting by default (behind expand only)
- Macro targets unless user explicitly opts in
- Grocery list (belongs in More)

---

### More

**Purpose:** Secondary systems and deeper planning not needed in daily execution.

**Key sections (each navigates to its own view):**
- **Habits** — daily/weekly habit tracking and streaks
- **Insights** — progress data and training trends
- **Finance** — budget tracking and transaction log
- **Maintenance** — home maintenance log

**Actions available:**
- Navigate into any section
- Log a habit (from Habits view)
- View insight summaries
- Log transactions or view budget (Finance)
- Add maintenance item

**Must NOT live here:**
- Anything required daily (belongs on Home or Fitness)
- Inbox (stays in top nav)
- Workout execution
- Focus sessions

---

### Inbox (top nav surface)

**Purpose:** Capture everything unclassified, then triage items into their proper home.

See full Inbox blueprint below.

---

### Settings (top nav surface)

**Purpose:** Global app configuration, not visited during daily use.

**Key sections:**
- Fitness program settings (program type, training days, start date)
- Notification preferences (morning reminder, workout reminder)
- Morning check-in toggle
- Meal preferences (dietary notes, hydration goal)
- Calendar preferences (work calendar patterns)

**Must NOT live here:**
- Daily task management
- Active session controls
- Anything that changes during execution

---

### Workout Player (full-screen overlay)

**Purpose:** Active workout execution with no distractions.

**Key sections:**
- Workout name + program context (header)
- Segment/exercise list — sets, reps, distance, duration, cues
- Current exercise highlighted
- Progress indicator (segment X of Y)
- Post-workout notes field

**Actions available:**
- Mark a set or exercise complete
- Log actual reps/weight/time
- Skip an exercise
- End workout → triggers completion confirmation + summary

**Must NOT live here:**
- Bottom nav (hidden during player)
- Anything unrelated to the current session

---

### Focus Session (ring timer overlay)

**Purpose:** Visual countdown for a time-boxed focus block. Launched from Home.

Uses `FocusTimer.jsx` (SVG ring, presets 15m / 25m / 45m / 60m, live countdown).

**Key sections:**
- Circular ring progress (SVG)
- Remaining time display (mm:ss)
- Duration preset selector (shown before start)
- Task label field (what you're focusing on)

**Actions available:**
- Select duration
- Label the session
- Start / pause / stop
- Dismiss when done

**Must NOT live here:**
- Task list
- Navigation
- Multi-session tracking

---

### Routine Player (guided step modal)

**Purpose:** Step-by-step guided execution of a multi-step routine. Launched from Home.

Uses `RoutinePlayer.jsx` (progress dots, back/next/finish, step-type labels).

**Key sections:**
- Step progress dots (position in sequence)
- Current step — name, type badge (task / habit / focus / custom), duration
- Back / Next / Finish controls

**Actions available:**
- Advance through steps
- Return to previous step
- Skip a step
- Finish → marks `lastCompleted` on the routine

**Must NOT live here:**
- Routine editing (deferred)
- Navigation tabs

---

## Home / Today Screen Blueprint

### Zone 1 — Top Area

- **Date line:** Full date (e.g., Wednesday, April 8)
- **Greeting:** Time-contextual (morning / afternoon / evening)
- **Energy indicator:** After morning check-in completes, show a small colored dot or numeric badge (scale 1–10). Color-coded: green (7–10), amber (4–6), red (1–3)
- **Check-in prompt:** If morning check-in not done and it is before noon, show a quiet tap-to-open prompt — not a blocker
- **Keep this zone scannable** — no heavy stats, no cards

---

### Zone 2 — Active Block (conditional)

Only rendered when something is actively running. One block at a time, no stacking.

| State | What shows |
|-------|-----------|
| Focus session active | Condensed ring (small), task label, elapsed time, Stop button |
| Workout in progress | Workout name, last-completed exercise, "Return to Workout" tap target |
| Routine in progress | Routine name, current step, "Continue" tap target |
| Nothing active | Zone is hidden — no empty placeholder |

---

### Zone 3 — Today's Workout

Always present if a workout is scheduled for today.

- Workout name, session type, duration, program week/phase context
- Exercise count or brief session summary (e.g., "6 exercises · 55 min")
- **Primary action:** "Start Workout" → launches WorkoutPlayer full-screen
- **Secondary actions:** Skip (reason optional) or Move (triggers auto-move confirmation)
- **Rest day state:** Small quiet row — "Rest day" — no card padding
- **Missed workout (from yesterday):** Displayed as a separate banner above this card with options to move or dismiss

---

### Zone 4 — Task Execution Feed

- Section header: "Today" with task count
- Tasks filtered to today's planned/active tasks (by `status: 'planned' | 'active'`)
- Rendered via `ExecutionTaskItem` — checkbox, title, priority dot
- Sort order: active first, then priority descending, then `createdAt`
- Swipe or checkbox tap marks complete → status becomes `'done'`, item fades or collapses
- "Add task" row at bottom → opens QuickAdd (task tab)
- Empty state: visible nudge toward FAB
- No subtask expansion inline — that belongs in a task detail view (deferred)

---

### Zone 5 — Routine Visibility

Only shown if routines are scheduled for today (matching `scheduleDays` + today's date).

- Each routine: name, step count, scheduled time, Start button
- Completed today: collapsed to a single check-row (name + checkmark)
- If no routines scheduled today: section is hidden entirely

---

### Zone 6 — Focus Visibility

- **No active session:** Compact launcher — duration preset chips (15 / 25 / 45 / 60) + "Start Focus" label field entry → tap starts FocusTimer overlay
- **Session just completed (within ~60 min):** Small row — "Last focus: 25m on [label]"
- This is a launcher, not a management view
- No focus history list here

---

### Zone 7 — Nutrition Bar

- Four fixed slots: Breakfast · Lunch · Dinner · Snack
- Each slot: slot name + state indicator (logged = checkmark, empty = "Add")
- Tap any slot → minimal meal log entry (text field for name, slot pre-selected)
- No calorie counts visible in this zone
- "View nutrition detail" link → navigates to Fitness / Nutrition sub-tab

---

## Inbox Blueprint

### Capture

- Single text input always visible at the top of InboxScreen
- Optional note field appears after text is entered (collapsed by default)
- Submit creates an inbox item: `{text, note, createdAt: now, module: null}`
- FAB (Quick Add) on all other tabs routes here — creates the same inbox item structure
- No type selection at capture time — classification happens at triage
- Capture is intentionally unstructured: get it in fast, sort it later

---

### Triage

- Items listed reverse-chronological (newest first)
- Each item row: text preview, note indicator (if note exists), relative timestamp (e.g., "2h ago")
- Triage triggered by: tap item → slide-up action sheet, or swipe right to reveal actions
- Untriaged items show a distinct visual state (no module assigned)
- Triaged/converted items either disappear or show a "Moved to Tasks" / "Added to Calendar" confirmation row that auto-dismisses

---

### Conversion

| Triage action | What happens |
|--------------|-------------|
| → Task | Creates `Task {title: text, status: 'planned', priority: 'normal'}`. Item removed from inbox. |
| → Calendar | Opens minimal date + time picker. Creates `CalendarEvent`. Item removed from inbox. |
| → Fitness | Creates a workout stub or opens QuickAdd (workout tab) pre-filled with text. Item removed from inbox. |
| → Note | Deferred (V1: item stays with `module: 'note'` tag, no dedicated notes view yet) |
| → Delete | Permanently removes. No conversion. |

- Inbox badge count in header reflects items where `module === null`
- Converted items do not count toward the badge

---

## Shared Object Behavior

### Task

| Context | Render pattern |
|---------|---------------|
| Home / Today feed | `ExecutionTaskItem`: checkbox + title + priority dot. Swipe or tap checkbox to complete. |
| Calendar day view | Listed as a `type: 'task'` event row — title only, no checkbox. Tap to view detail. |
| Inbox conversion | Source text becomes task title. Priority defaults to normal. |
| Fitness / More | Does not appear. |

---

### Focus Session

| Context | Render pattern |
|---------|---------------|
| Home active block | Condensed ring + task label + elapsed/remaining time + Stop. |
| Home launcher | Duration chips + label field + Start button. |
| Calendar | Focus blocks may appear as auto-written events if duration + time are logged (V1: manual add only). |
| AppContext state | `{active, taskLabel, durationMinutes, startedAt}` — resets on app reload. No persistent history in V1. |

---

### Routine

| Context | Render pattern |
|---------|---------------|
| Home today section | Card: name + step count + scheduled time + Start button. Completed state: collapsed check-row. |
| Routine Player | Full guided modal — `RoutinePlayer.jsx`. Progress dots, step content, back/next/finish controls. |
| More / Habits | Completion history may surface here (V1: deferred). |
| Calendar | Auto-written if `scheduleTime` is set — appears as a time block (read-only in Calendar). |

---

### Workout

| Context | Render pattern |
|---------|---------------|
| Home today zone | Compact card: name + type + duration + Start / Skip actions. Missed: banner above card. |
| Fitness / Training tab | Full card: exercise list preview, week strip, missed workout prompt. |
| Calendar | Auto-written as a time block. Read-only in Calendar view — edit and launch from Fitness. |
| Workout Player | Full-screen overlay — `WorkoutPlayer.jsx`. No nav tabs visible. |
| Missed (yesterday) | Banner on both Home and Fitness with auto-move confirmation prompt. |

---

### Meal

| Context | Render pattern |
|---------|---------------|
| Home nutrition bar | Slot row: slot name + logged/empty indicator. Tap to log (name only). |
| Fitness / Nutrition tab | Expanded daily log: meal name + slot tag + timestamp. Weekly summary available. |
| Inbox conversion | Text → meal stub with slot selection prompt. Creates `Meal {name, tags: [slot], loggedAt}`. |
| Calendar / Home task feed | Does not appear. |

---

## V1 Scope

### Build in V1

**Screens and surfaces:**
- Home / Today — all 7 zones defined above
- Inbox — capture + triage + conversion (task, calendar, workout, delete)
- Calendar — week strip + day timeline with auto-written items (workouts, routines)
- Fitness / Training — today's workout card, weekly strip, missed workout banner, auto-move confirmation, program context
- Fitness / Nutrition — slot-based daily log, hydration counter, expandable detail toggle
- More — shell with navigable section entries (Habits, Insights, Finance, Maintenance)
- Settings — program settings, notification prefs, morning check-in toggle, meal prefs shell

**Overlays / players (all already have component foundations):**
- `WorkoutPlayer.jsx` — wire to Fitness tab and Home today card
- `RoutinePlayer.jsx` — wire to Home routines section
- `FocusTimer.jsx` — wire to Home focus launcher and active block
- `QuickAddModal.jsx` — routes captured items to Inbox
- `MorningCheckinModal.jsx` — triggered on first Home visit each day

**System behaviors:**
- Calendar auto-write: workouts and routines with `scheduleTime` placed as calendar blocks
- Missed workout auto-move: banner triggers move/skip confirmation → updates `scheduledDate` or sets `status: 'skipped'`
- Inbox badge: count of items where `module === null`
- Energy state: shown in Home top zone after morning check-in; drives no logic in V1

---

## Deferred — Later Phase

**Features:**
- Notes destination for Inbox conversion (needs a notes list in More)
- Detailed nutrition planning: macro targets, weekly meal templates, calorie display
- Grocery list UI (field exists in ProfileContext, needs a screen in More)
- Habit streaks and heat maps (More / Habits detail)
- Insights analytics and charting (More / Insights)
- Finance full UI (More / Finance)
- Maintenance log full UI (More / Maintenance)
- Subtask expansion inline in Home task feed
- Focus session history and statistics
- Recovery module UI (data fields exist in AppContext, no screen)
- Custom routine builder (RoutinePlayer exists; builder/editor deferred)
- Program enrollment and switching flow (Settings shell only in V1)
- Sleep/HRV source integration (field: `sleepSource` exists; manual-only in V1)
- Desktop / responsive layout

**Data not exposed in V1 UI:**
- Hydration goal editing (goal is set, editing UI deferred)
- Exercise library browsing
- Workout template browser
- Program progress analytics

---

## Critical Files for Implementation

| Area | File |
|------|------|
| Main shell + screen router | `src/main.jsx` |
| App state (focus, energy, check-in) | `src/context/AppContext.jsx` |
| Task / workout / meal / routine / inbox data | `src/context/TaskContext.jsx` |
| Workout execution | `src/components/WorkoutPlayer.jsx` |
| Routine execution | `src/components/RoutinePlayer.jsx` |
| Focus timer | `src/components/FocusTimer.jsx` |
| Quick add modal | `src/components/QuickAddModal.jsx` |
| Morning check-in | `src/components/MorningCheckinModal.jsx` |
| Inbox surface | `src/views/InboxScreen.jsx` |
| Task execution row | `src/components/ExecutionTaskItem.jsx` |
| Navigation + header | `src/components/AppFrame.jsx`, `src/components/Header.jsx` |
| UI primitives | `src/components/ui/` |
| Workout schema + session types | `src/data/workoutSystemSchema.js` |
| Workout state logic | `src/data/workoutSystemState.js` |
| Design tokens | `src/styles.css`, `src/components/ui/primitives.css` |
