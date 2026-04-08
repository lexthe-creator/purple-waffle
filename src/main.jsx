import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import AppFrame from './components/AppFrame.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import FocusTimer from './components/FocusTimer.jsx';
import MorningCheckinModal from './components/MorningCheckinModal.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import RoutinePlayer from './components/RoutinePlayer.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import FinanceScreen from './views/FinanceScreen.jsx';
import HomeScreen from './views/HomeScreen.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
import { ProfileProvider, useProfileContext } from './context/ProfileContext.jsx';
import {
  ALL_STATIONS,
  PHASES,
  getCurrentWeek,
  getPlanState,
  getStationMeta,
} from './data/hyroxPlan.js';
import { normalizeProgramType } from './data/programRouter.js';
import { sessionTypes } from './data/workoutSystemSchema.js';
import {
  buildWorkoutContentFromSession,
  normalizeWorkoutLog,
  normalizeWorkoutRecord,
} from './data/workoutSystemState.js';
import {
  QUICK_MEAL_TAGS,
  NUTRITION_SLOTS,
  RECOVERY_SESSIONS,
  SAVED_MEALS,
  computePaces,
  computeRecoveryState,
  computeWeeklyAnalytics,
  adjustWorkoutForRecovery,
  generateWorkout,
  hydrateWorkoutSession,
  getSwapCandidates,
  getRecoveryAwareWorkoutSuggestions,
  resolveWeeklyTrainingPlan,
} from './data/hubData.js';
import { Card, SectionHeader, MetricBlock, ListRow, EmptyState, ExpandablePanel } from './components/ui/index.js';
import './styles.css';

const ROOT_TABS = [
  {
    id: 'home',
    label: 'Home',
    iconPath: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    iconPath: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    iconPath: '<path d="M6 8v8M18 8v8"/><path d="M9 12h6"/><path d="M4 10h2v4H4zM18 10h2v4h-2z"/>',
  },
  {
    id: 'more',
    label: 'More',
    iconPath: '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
  },
];

const FITNESS_SUBTABS = [
  { id: 'training', label: 'Training' },
  { id: 'nutrition', label: 'Nutrition' },
];

const MORE_SECTIONS = [
  { id: 'habits', label: 'Habits' },
  { id: 'insights', label: 'Insights' },
  { id: 'finance', label: 'Finance' },
  { id: 'maintenance', label: 'Maintenance' },
];

const WORKOUT_MISS_HOUR = 20;

const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'];
const RACE_CATEGORIES = ['Open', 'Pro', 'Masters'];
const AVAILABLE_PROGRAMS = [
  {
    id: 'hyrox',
    label: 'HYROX Plan',
    description: 'Current generator and plan views are fully wired for HYROX.',
  },
  {
    id: '5k',
    label: 'Run Builder',
    description: 'Available for program selection; full downstream UI is still being phased in.',
  },
  {
    id: 'strength_block',
    label: 'Strength Block',
    description: 'Placeholder slot for upcoming multi-program planning support.',
  },
];
const WEEKDAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const SHELL_TAB_COPY = {
  home: {
    eyebrow: 'Home',
    title: 'Top tasks and focus',
    description: 'Home is now anchored by tasks first, schedule second, and a compact status check-in.',
    bullets: [
      'Top tasks and a main focus item lead the screen.',
      "Today's schedule previews calendar and fitness commitments.",
      'Today status stays compact so action remains primary.',
    ],
  },
  calendar: {
    eyebrow: 'Calendar',
    title: "Today's schedule",
    description: 'Phase 1 shell placeholder. Calendar structure stays stable for the later rebuild.',
    bullets: [
      'Agenda and day planning go here.',
      'Busy blocks stay visible in one place.',
      'Home will read from this flow later.',
    ],
  },
  fitness: {
    eyebrow: 'Fitness',
    title: 'Workout space',
    description: 'Fitness is now the workout detail and control layer, while Calendar keeps ownership of timing and scheduling.',
    bullets: [
      "Today's workout leads the page.",
      'The full weekly plan sits directly below it.',
      'Library and logging stay available as secondary views.',
    ],
  },
  more: {
    eyebrow: 'More',
    title: 'Secondary workspaces',
    description: 'Habits, Insights, Finance, and Maintenance — lifestyle management features not needed every day.',
    bullets: [
      'Habits: daily and weekly behavior tracking.',
      'Insights: weekly review and notes.',
      'Finance and Maintenance: reference and upkeep.',
    ],
  },
};

const SHELL_SURFACE_COPY = {
  inbox: {
    eyebrow: 'Inbox',
    title: 'Quick capture inbox',
    description: 'Quick Capture opens here during Phase 1. Capture and sorting logic comes later.',
    bullets: [
      'Anything captured lands here first.',
      'Organization rules are deferred to Phase 3.',
      'This surface keeps the shell route stable.',
    ],
  },
  settings: {
    eyebrow: 'Settings',
    title: 'App settings',
    description: 'Settings stay reachable from the header, but the detailed setup flow is not being rebuilt yet.',
    bullets: [
      'Preferences remain as a shell surface.',
      'Fitness and nutrition settings stay out of scope here.',
      'Phase 7 can expand this area later.',
    ],
  },
};

function ShellTabPanel({ active, eyebrow, title, description, bullets }) {
  return (
    <section className={`shell-tab-panel${active ? ' is-active' : ''}`} hidden={!active} aria-hidden={!active}>
      <Card className="shell-tab-card">
        <SectionHeader eyebrow={eyebrow} title={title} />
        <p className="shell-tab-copy">{description}</p>
        <div className="shell-tab-points">
          {bullets.map(point => (
            <div key={point} className="shell-tab-point">
              {point}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function InboxSurface({ inboxItems, onClose }) {
  const copy = SHELL_SURFACE_COPY.inbox;
  const items = Array.isArray(inboxItems) ? inboxItems : [];

  return (
    <div className="tab-stack shell-surface-page">
      <Card className="shell-surface-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="shell-surface-copy">{copy.description}</p>

        {items.length === 0 ? (
          <EmptyState
            title="Inbox is empty"
            description="Quick Capture items will land here first. Later phases will add review, assignment, and conversion."
          />
        ) : (
          <div className="shell-surface-list">
            {items.map(item => (
              <ListRow
                key={item.id}
                variant="card"
                label={item.text || 'Captured item'}
                sub={item.note || 'Ready for later review'}
                trailing={<span className="status-pill status-planned">Captured</span>}
              />
            ))}
          </div>
        )}
      </Card>

      <Card className="shell-surface-card">
        <SectionHeader eyebrow="Flow" title="Capture now, organize later" />
        <div className="shell-tab-points">
          {copy.bullets.map(point => (
            <div key={point} className="shell-tab-point">
              {point}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SettingsSurface({ onClose, fitnessSettings, notificationPrefs, recoveryInputs, mealPrefs, profile }) {
  const copy = SHELL_SURFACE_COPY.settings;
  const fitnessLevel = profile?.athlete?.fitnessLevel || 'unspecified';

  return (
    <div className="tab-stack shell-surface-page">
      <Card className="shell-surface-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2>{copy.title}</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="shell-surface-copy">{copy.description}</p>

        <div className="ui-metrics-row">
          <MetricBlock value={fitnessSettings.programType || 'hyrox'} label="Program" />
          <MetricBlock value={fitnessSettings.trainingDays || '4-day'} label="Training" />
          <MetricBlock value={notificationPrefs.morningReminder ? 'On' : 'Off'} label="Morning reminder" />
          <MetricBlock value={fitnessLevel} label="Fitness level" />
        </div>
      </Card>

      <Card className="shell-surface-card">
        <SectionHeader eyebrow="Shell" title="Settings stays lightweight in Phase 1" />
        <div className="shell-surface-list">
          <ListRow variant="card" label="Recovery" sub={recoveryInputs.preferredSession || 'fullbody'} />
          <ListRow variant="card" label="Hydration goal" sub={`${mealPrefs.hydrationGoal || 8} cups`} />
          <ListRow variant="card" label="Notes" sub="Detailed settings rebuild comes later." />
        </div>
      </Card>
    </div>
  );
}

function getCalendarItemTypeLabel(type) {
  switch (type) {
    case 'busy':
      return 'Busy block';
    case 'plan':
      return 'Plan';
    case 'task':
      return 'Task';
    case 'meal':
      return 'Meal';
    case 'workout':
      return 'Workout';
    case 'event':
    default:
      return 'Event';
  }
}

const TASK_STATUS_ORDER = { planned: 0, active: 1 };

function HomeDashboard({ now }) {
  const { tasks, setTasks, workouts, meals, calendarItems, routines } = useTaskContext();
  const { fitnessSettings, energyState, focusSession, setFocusSessionDetails, setActiveBlock } = useAppContext();
  const { profile } = useProfileContext();

  const todayKey = toDateKey(now);
  const athleteDefaults = profile?.athlete || {};
  const workoutHistory = useMemo(
    () => workouts.map(workout => ({
      ...workout,
      plannedDate: workout.plannedDate || workout.scheduledDate || null,
    })),
    [workouts],
  );
  const planState = useMemo(
    () => getPlanState({
      startDate: fitnessSettings.programStartDate,
      trainingDays: fitnessSettings.trainingDays,
      programType: fitnessSettings.programType,
      today: now,
      history: workoutHistory,
      athleteDefaults,
    }),
    [athleteDefaults, fitnessSettings.programStartDate, fitnessSettings.programType, fitnessSettings.trainingDays, now, workoutHistory],
  );
  const todayWorkoutCard = useMemo(
    () => getTodayWorkoutCardState({
      weeklySchedule: planState.sessions,
      todayKey,
      programType: fitnessSettings.programType,
    }),
    [fitnessSettings.programType, planState.sessions, todayKey],
  );

  const readiness = useMemo(
    () => computeRecoveryState(
      { energyScore: energyState.value, sleepHours: energyState.sleepHours },
      energyState.value,
      energyState.sleepHours,
    ),
    [energyState.sleepHours, energyState.value],
  );

  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );
  const loggedMeals = useMemo(
    () => todaysMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('planned')),
    [todaysMeals],
  );
  const todayCalendarItems = useMemo(
    () => calendarItems
      .filter(item => item.date === todayKey)
      .map(item => {
        const startAt = parseDateKeyTime(todayKey, item.startTime);
        const endAt = parseDateKeyTime(todayKey, item.endTime);
        const isCurrent = startAt instanceof Date && (
          endAt instanceof Date
            ? startAt <= now && now < endAt
            : startAt <= now && now < new Date(startAt.getTime() + 30 * 60 * 1000)
        );
        const isUpcoming = startAt instanceof Date && startAt > now;
        return { ...item, startAt, endAt, isCurrent, isUpcoming };
      })
      .sort((left, right) => {
        if (left.isCurrent !== right.isCurrent) return left.isCurrent ? -1 : 1;
        if (left.isUpcoming !== right.isUpcoming) return left.isUpcoming ? -1 : 1;
        return (left.startAt || 0) - (right.startAt || 0);
      }),
    [calendarItems, todayKey, now],
  );
  const openTasks = useMemo(
    () => tasks
      .filter(task => task.status !== 'done')
      .slice()
      .sort((left, right) => {
        const leftPriority = left.priority ? 0 : 1;
        const rightPriority = right.priority ? 0 : 1;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        const leftOrder = TASK_STATUS_ORDER[left.status] ?? 2;
        const rightOrder = TASK_STATUS_ORDER[right.status] ?? 2;
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return (left.createdAt || 0) - (right.createdAt || 0);
      })
      .slice(0, 3),
    [tasks],
  );
  const mealSlotProgress = useMemo(
    () => NUTRITION_SLOTS.map(slot => {
      const complete = loggedMeals.some(meal => {
        const tags = Array.isArray(meal.tags) ? meal.tags : [];
        if (tags.includes(`slot:${slot.id}`)) return true;
        const haystack = `${meal.name || ''} ${tags.join(' ')}`.toLowerCase();
        return slot.keywords.some(keyword => haystack.includes(keyword));
      });
      return { ...slot, complete };
    }),
    [loggedMeals],
  );

  const taskCompletedCount = tasks.filter(task => task.status === 'done').length;
  const taskCompletionValue = `${taskCompletedCount}/${tasks.length}`;
  const scheduledItemCount = todayCalendarItems.length + (todayWorkoutCard.kind === 'workout' ? 1 : 0);
  const calendarStatus = scheduledItemCount > 0 ? `${scheduledItemCount} scheduled` : 'Open';
  const calendarMetricValue = useMemo(() => {
    const timedItems = todayCalendarItems.filter(item => item.startAt instanceof Date);
    const currentItem = timedItems.find(item => item.isCurrent);
    if (currentItem) return 'Busy now';
    const nextItem = timedItems.find(item => item.isUpcoming);
    if (!nextItem) return 'Open';
    const minutesUntilNext = Math.round((nextItem.startAt.getTime() - now.getTime()) / (60 * 1000));
    const nextTimeLabel = formatStatusTime(nextItem.startAt);
    return minutesUntilNext <= 90 ? `Next ${nextTimeLabel}` : `Free until ${nextTimeLabel}`;
  }, [now, todayCalendarItems]);
  const hasCompletedWorkout = workouts.some(workout => {
    const scheduledKey = workout.scheduledDate || workout.plannedDate;
    return scheduledKey === todayKey && workout.status === 'completed';
  });
  const hasMissedWorkout = workouts.some(workout => {
    const scheduledKey = workout.scheduledDate || workout.plannedDate;
    return scheduledKey === todayKey && workout.status === 'skipped';
  });
  const workoutMarkedMissed = todayWorkoutCard.kind === 'workout'
    && todayWorkoutCard.canStart
    && !hasCompletedWorkout
    && (hasMissedWorkout || isWorkoutPastCutoff(now));
  const fitnessState = hasCompletedWorkout
    ? 'done'
    : workoutMarkedMissed
      ? 'missed'
      : 'planned';
  const fitnessStatus = fitnessState === 'done'
    ? 'Done'
    : fitnessState === 'missed'
      ? 'Missed'
      : 'Planned';
  const completedMealSlots = mealSlotProgress.filter(slot => slot.complete).length;

  const scheduleIntro = scheduledItemCount > 0
    ? `${scheduledItemCount} item${scheduledItemCount === 1 ? '' : 's'} are shaping the day.`
    : 'The day is still open, so this is where upcoming calendar and training items will land.';
  const taskStatusTone = taskCompletedCount > 0 ? 'status-active' : 'status-planned';
  const calendarTone = scheduledItemCount > 0 ? 'status-active' : 'status-planned';
  const readinessState = readiness.level === 'High'
    ? 'high'
    : readiness.level === 'Moderate'
      ? 'moderate'
      : 'low';

  return (
    <div className="tab-stack home-dashboard">
      <section className="home-status-strip" aria-label="Today status">
        <p className="home-status-label">Today status</p>
        <div className="home-readiness-indicator" aria-label={`Readiness ${readiness.level}`}>
          <span className={`home-readiness-dot home-readiness-dot--${readinessState}`} aria-hidden="true" />
          <span className="home-readiness-text">{readiness.level} readiness</span>
        </div>
        <div className="home-status-row">
          <div className="home-status-item">
            <span className="home-status-item-label">Tasks</span>
            <strong className="home-status-item-value">{taskCompletionValue}</strong>
          </div>

          <div className="home-status-item">
            <span className="home-status-item-label">Calendar</span>
            <strong className="home-status-item-value">{calendarMetricValue}</strong>
          </div>

          <div className="home-status-item">
            <span className="home-status-item-label">Fitness</span>
            <strong className="home-status-item-value home-status-inline">
              <span className={`home-fitness-dot home-fitness-dot--${fitnessState}`} aria-hidden="true" />
              {fitnessStatus}
            </strong>
          </div>

          <div className="home-status-item home-status-item--nutrition">
            <span className="home-status-item-label">Nutrition</span>
            <div className="home-nutrition-track" aria-label={`${completedMealSlots} of 4 meals logged`}>
              {mealSlotProgress.map(slot => (
                <span
                  key={slot.id}
                  className={`home-nutrition-segment ${slot.complete ? 'is-complete' : ''}`}
                  title={slot.label}
                >
                  <span className="sr-only">{slot.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {routines.length > 0 && (
        <Card variant="flat" className="home-card home-section home-routines-card">
          <SectionHeader eyebrow="Routines" title="Today's routines" />
          <div className="home-list">
            {routines.map(routine => {
              const isCompleted = routine.lastCompleted === toDateKey(now);
              return (
                <ListRow
                  key={routine.id}
                  variant="card"
                  label={routine.name}
                  sub={`${routine.steps.length} step${routine.steps.length === 1 ? '' : 's'}${routine.scheduleTime ? ` · ${routine.scheduleTime}` : ''}`}
                  trailing={
                    isCompleted
                      ? <span className="status-pill status-done">Done</span>
                      : (
                        <button
                          type="button"
                          className="ghost-button compact-ghost"
                          onClick={() => setActiveBlock({ type: 'routine', id: routine.id })}
                        >
                          Start
                        </button>
                      )
                  }
                />
              );
            })}
          </div>
        </Card>
      )}

      <Card variant="flat" className="home-card home-section home-focus-card">
        <SectionHeader eyebrow="Focus" title="Deep work session" />
        {/* Active FocusTimer is promoted to AppShell level (survives tab switches).
            This card only renders the idle setup form; once active, AppShell takes over. */}
        <FocusTimer
          session={focusSession}
          onStart={({ taskLabel, durationMinutes }) => {
            setActiveBlock({ type: 'focus', id: null });
            setFocusSessionDetails({ taskLabel, durationMinutes, startedAt: Date.now() });
          }}
          onStop={() => {
            setActiveBlock(null);
            setFocusSessionDetails(s => ({ ...s, startedAt: null }));
          }}
          onDismiss={() => {
            setActiveBlock(null);
            setFocusSessionDetails({ taskLabel: '', durationMinutes: 25, startedAt: null });
          }}
        />
      </Card>

      <Card variant="flat" className="home-card home-section home-tasks-card">
        <SectionHeader
          eyebrow="Tasks"
          title="Today's top tasks"
          action={<span className={`status-pill ${taskStatusTone}`}>{taskCompletionValue}</span>}
        />

        {openTasks.length === 0 ? (
          <EmptyState
            title="No open tasks yet"
            description="Quick Capture or Inbox will be the right place to add the next priority."
          />
        ) : (
          <div className="home-list">
            {openTasks.map(task => (
              <ListRow
                key={task.id}
                variant="card"
                label={task.title || 'Untitled task'}
                sub={task.notes || (task.status === 'active' ? 'Active' : 'Planned')}
                onClick={() =>
                  setTasks(current =>
                    current.map(t =>
                      t.id === task.id ? { ...t, status: t.status === 'done' ? 'active' : 'done' } : t
                    )
                  )
                }
                trailing={(
                  <span className={`status-pill ${task.priority ? 'status-priority' : task.status === 'active' ? 'status-active' : 'status-planned'}`}>
                    {task.priority ? 'Priority' : task.status === 'active' ? 'Active' : 'Planned'}
                  </span>
                )}
              />
            ))}
          </div>
        )}
      </Card>

      <Card variant="flat" className="home-card home-section home-schedule-card">
        <SectionHeader
          eyebrow="Today"
          title="Today's schedule"
          action={<span className={`status-pill ${calendarTone}`}>{calendarStatus}</span>}
        />
        <p className="home-card-copy">{scheduleIntro}</p>

        <div className="home-list">
          {todayCalendarItems.filter(item => item.isCurrent).map(item => (
            <ListRow
              key={item.id}
              variant="card"
              label={item.title ||'Untitled item'}
              sub={`${item.startTime || '—'} - ${item.endTime || '—'}${item.notes ? ` · ${item.notes}` : ''}`}
              trailing={<span className="status-pill status-active">Now</span>}
            />
          ))}

          {todayWorkoutCard.kind === 'workout' && (
            <ListRow
              variant="card"
              label={todayWorkoutCard.title}
              sub={todayWorkoutCard.metaLine}
              trailing={<span className={`status-pill ${todayWorkoutCard.status.className}`}>{todayWorkoutCard.status.label}</span>}
            />
          )}

          {todayCalendarItems.filter(item => !item.isCurrent).map(item => (
            <ListRow
              key={item.id}
              variant="card"
              label={item.title || 'Untitled item'}
              sub={`${item.startTime || '—'} - ${item.endTime || '—'}${item.notes ? ` · ${item.notes}` : ''}`}
              trailing={<span className="status-pill status-planned">{getCalendarItemTypeLabel(item.type)}</span>}
            />
          ))}

          {todayWorkoutCard.kind !== 'workout' && todayCalendarItems.length === 0 && (
            <EmptyState
              title="No schedule items yet"
              description="Home will show today's plan once Calendar or Fitness has something scheduled."
            />
          )}
        </div>
      </Card>

    </div>
  );
}

function formatDateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(asDate(value));
}

function getContextualDateLabel(dateKey) {
  const todayK = toDateKey(new Date());
  const tomorrowK = toDateKey(addDays(new Date(), 1));
  const yesterdayK = toDateKey(addDays(new Date(), -1));

  const targetDate = dateKeyToDate(dateKey);
  const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const fullDate = `${weekday}, ${monthDay}`;

  if (dateKey === todayK) return { primary: 'Today', secondary: fullDate };
  if (dateKey === tomorrowK) return { primary: 'Tomorrow', secondary: fullDate };
  if (dateKey === yesterdayK) return { primary: 'Yesterday', secondary: fullDate };

  if (sameCalendarWeek(dateKey, todayK)) {
    return { primary: weekday, secondary: fullDate };
  }

  if (isNextCalendarWeek(dateKey, todayK)) {
    return { primary: 'Next week', secondary: fullDate };
  }

  return { primary: weekday, secondary: fullDate };
}

function getItemStatusTone(itemType) {
  if (itemType === 'busy') return 'status-priority';
  if (itemType === 'event') return 'status-active';
  if (itemType === 'workout') return 'status-active';
  if (itemType === 'meal') return 'status-active';
  return 'status-planned';
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(asDate(value));
}

function formatShortMonthDay(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(asDate(value));
}

function formatShortTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(asDate(value));
}

function formatStatusTime(value) {
  const date = asDate(value);
  return new Intl.DateTimeFormat('en-US', date.getMinutes() === 0
    ? { hour: 'numeric' }
    : { hour: 'numeric', minute: '2-digit' }).format(date);
}

function parseDateKeyTime(dateKey, timeValue) {
  if (typeof dateKey !== 'string' || typeof timeValue !== 'string' || !timeValue.trim()) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  if ([year, month, day, hours, minutes].some(value => Number.isNaN(value))) return null;
  return new Date(year, month - 1, day, hours, minutes);
}

function startOfDay(value) {
  const date = asDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  const date = asDate(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function isWorkoutPastCutoff(date = new Date()) {
  return date.getHours() >= WORKOUT_MISS_HOUR;
}

function sameDay(left, right) {
  return toDateKey(left) === toDateKey(right);
}

function toDateKey(value) {
  const date = startOfDay(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKeyToDate(value, hour = 12) {
  if (!isDateKey(value)) return new Date(value);
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function asDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (isDateKey(value)) return dateKeyToDate(value);
  return new Date(value);
}

function sameCalendarWeek(left, right, anchorDay = 'Monday') {
  return toDateKey(alignDateToAnchor(asDate(left), anchorDay)) === toDateKey(alignDateToAnchor(asDate(right), anchorDay));
}

function isNextCalendarWeek(target, reference = new Date(), anchorDay = 'Monday') {
  const nextWeekStart = addDays(alignDateToAnchor(asDate(reference), anchorDay), 7);
  return toDateKey(alignDateToAnchor(asDate(target), anchorDay)) === toDateKey(nextWeekStart);
}

function formatAgendaTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return '';
  if (!startTime || !endTime) return startTime || endTime;
  const startLabel = formatStatusTime(`2000-01-01T${startTime}`);
  const endLabel = formatStatusTime(`2000-01-01T${endTime}`);
  return `${startLabel} - ${endLabel}`;
}

// ── Day Timeline planner ──────────────────────────────────────
const TIMELINE_START_HOUR = 6;   // 6 AM
const TIMELINE_END_HOUR = 22;    // 10 PM
const HOUR_HEIGHT_PX = 54;       // px per hour slot
const MIN_BLOCK_MINUTES = 30;    // minimum rendered block height
const TIMELINE_TOTAL_HEIGHT = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX;
const TIMELINE_HOURS = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
  (_, i) => TIMELINE_START_HOUR + i,
);

function timeStringToMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':');
  return parseInt(h, 10) * 60 + parseInt(m || '0', 10);
}

function getTimelineBlockStyle(startTime, endTime) {
  const startMin = timeStringToMinutes(startTime);
  if (startMin === null) return null;
  const endMin = endTime ? timeStringToMinutes(endTime) : startMin + MIN_BLOCK_MINUTES;
  const durationMin = Math.max(endMin - startMin, MIN_BLOCK_MINUTES);
  const offsetMin = startMin - TIMELINE_START_HOUR * 60;
  if (offsetMin < 0) return null; // before visible range
  return {
    top: Math.round(offsetMin * HOUR_HEIGHT_PX / 60),
    height: Math.round(durationMin * HOUR_HEIGHT_PX / 60),
  };
}

function formatHourLabel(hour) {
  return formatStatusTime(`2000-01-01T${String(hour).padStart(2, '0')}:00`);
}

function getCalendarSyncCardState(workCalendarPrefs, calendarItems) {
  const rawStatus = workCalendarPrefs?.googleSyncStatus;
  const hasCalendarItems = calendarItems.length > 0;
  const status = rawStatus === 'error'
    ? 'error'
    : rawStatus === 'connected_empty'
      ? 'connected_empty'
      : rawStatus === 'connected' && !hasCalendarItems
        ? 'connected_empty'
        : rawStatus === 'connected'
          ? 'connected'
          : 'disconnected';

  if (status === 'connected') {
    return {
      dotClassName: 'cal-sync-dot--on',
      title: 'Google connected',
      description: 'Calendar sync is active.',
      ctaLabel: 'Manage connection',
      statusPill: 'Connected',
      toneClassName: 'status-active',
      needsAttention: false,
    };
  }

  if (status === 'connected_empty') {
    return {
      dotClassName: 'cal-sync-dot--on',
      title: 'Google connected',
      description: 'Sync is active, but no calendar items were found yet.',
      ctaLabel: 'Manage connection',
      statusPill: 'Sync active',
      toneClassName: 'status-planned',
      needsAttention: false,
    };
  }

  if (status === 'error') {
    return {
      dotClassName: 'cal-sync-dot--error',
      title: 'Sync needs attention',
      description: 'Reconnect Google Calendar or review sync settings.',
      ctaLabel: 'Open settings',
      statusPill: 'Action needed',
      toneClassName: 'status-priority',
      needsAttention: true,
    };
  }

  return {
    dotClassName: 'cal-sync-dot--off',
    title: 'Connect Google to sync',
    description: 'Connect Google Calendar in Settings to import events automatically.',
    ctaLabel: 'Go to Settings',
    statusPill: 'Disconnected',
    toneClassName: 'status-planned',
    needsAttention: true,
  };
}

function getProgramDisplayName(programType) {
  switch (normalizeProgramType(programType)) {
    case '5k':
      return '5K run builder';
    case 'strength_block':
      return 'Strength Block plan';
    case 'hyrox':
    default:
      return 'HYROX plan';
  }
}

function getProgramFieldVisibility(programType) {
  const normalized = normalizeProgramType(programType);
  return {
    showRaceName: normalized === 'hyrox',
    showRaceCategory: normalized === 'hyrox',
    showGoalFinishTime: normalized === 'hyrox' || normalized === '5k',
    showRaceDate: normalized === 'hyrox' || normalized === '5k',
    showCurrentWeeklyMileage: normalized === 'hyrox' || normalized === '5k',
  };
}

function getProgramEmptyState(programType) {
  const normalized = normalizeProgramType(programType);

  switch (normalized) {
    case '5k':
      return {
        title: '5K setup saved',
        description: 'Your 5K settings are saved, but workouts have not generated yet.',
      };
    case 'strength_block':
      return {
        title: 'Strength Block setup saved',
        description: 'Your Strength Block settings are saved, but workouts have not generated yet.',
      };
    case 'hyrox':
    default:
      return {
        title: 'No workouts ready yet',
        description: 'Your settings are saved, but workouts have not generated yet.',
      };
  }
}

function getSessionTypeMeta(sessionTypeId) {
  const session = sessionTypes[sessionTypeId];
  if (!session) return null;

  return {
    id: session.sessionTypeId,
    title: session.displayName,
    category: session.category,
    duration: session.duration,
    objective: session.objective,
  };
}

function getProgramLibrarySections(programType) {
  const normalized = normalizeProgramType(programType);

  if (normalized === 'strength_block') {
    return [];
  }

  const sectionKeys = normalized === '5k'
    ? [
        { title: 'Easy', keys: ['run_easy'] },
        { title: 'Quality', keys: ['run_intervals', 'run_tempo'] },
        { title: 'Long', keys: ['run_long'] },
        { title: 'Recovery', keys: ['recovery_walk_mobility', 'recovery_pilates', 'recovery_yoga'] },
      ]
    : [
        { title: 'Strength', keys: ['strength_lower', 'strength_upper', 'strength_full', 'strength_hybrid'] },
        { title: 'Running', keys: ['run_easy', 'run_intervals', 'run_tempo', 'run_long'] },
        { title: 'Conditioning', keys: ['conditioning_hyrox', 'conditioning_engine', 'conditioning_circuit'] },
        { title: 'Recovery', keys: ['recovery_walk_mobility', 'recovery_pilates', 'recovery_yoga'] },
      ];

  return sectionKeys
    .map(section => ({
      title: section.title,
      items: section.keys
        .map(getSessionTypeMeta)
        .filter(Boolean),
    }))
    .filter(section => section.items.length > 0);
}

function getProgramWorkoutTypeLabel(session) {
  if (!session) return 'Workout';
  if (session.type === 'run') return 'Run';
  if (session.type === 'recovery') return 'Recovery';
  if (session.type === 'strength') return 'Strength';
  if (session.type === 'conditioning') return 'Conditioning';
  if (session.type === 'hyrox') return 'HYROX';
  return 'Workout';
}

function getWorkoutStatusLabel(session, todayKey, isTodayCard = false) {
  if (!session) {
    return { label: 'Planned', className: 'status-planned' };
  }

  if (session.status === 'completed') {
    return { label: 'Completed', className: 'status-active' };
  }

  if (session.status === 'missed') {
    return { label: 'Missed', className: 'status-missed' };
  }

  if (session.status === 'skipped') {
    return { label: 'Planned', className: 'status-planned' };
  }

  if (session.type === 'recovery') {
    return { label: 'Recovery', className: 'status-planned' };
  }

  if (isTodayCard || session.dateKey === todayKey || session.status === 'today') {
    return { label: 'Suggested', className: 'status-priority' };
  }

  return { label: 'Planned', className: 'status-planned' };
}

function getTodayWorkoutCardState({
  weeklySchedule,
  todayKey,
  programType,
}) {
  if (!Array.isArray(weeklySchedule) || weeklySchedule.length === 0) {
    return {
      kind: 'empty',
      title: 'No workouts ready yet',
      description: getProgramEmptyState(programType).description,
    };
  }

  const todaySession = weeklySchedule.find(session => session.dateKey === todayKey && session.status !== 'skipped') ?? null;
  const nextSession = weeklySchedule.find(session => session.dateKey > todayKey && session.status !== 'completed' && session.status !== 'skipped')
    ?? weeklySchedule.find(session => session.status === 'planned')
    ?? weeklySchedule.find(session => session.status === 'today')
    ?? null;

  const displaySession = todaySession ?? nextSession;
  if (!displaySession) {
    return {
      kind: 'empty',
      title: 'No workouts ready yet',
      description: getProgramEmptyState(programType).description,
    };
  }

  const selectedIsToday = Boolean(todaySession);
  const status = getWorkoutStatusLabel(displaySession, todayKey, selectedIsToday);
  const workoutTitle = displaySession.label || displaySession.title || 'Workout';
  const workoutMeta = [
    displaySession.duration ? `${displaySession.duration} min` : null,
    getProgramWorkoutTypeLabel(displaySession),
  ].filter(Boolean).join(' · ');
  const helperLine = selectedIsToday
    ? `Planned for today: ${displaySession.label || displaySession.title || 'Workout'}`
    : `Next planned workout: ${displaySession.label || displaySession.title || 'Workout'}`;

  return {
    kind: 'workout',
    session: displaySession,
    title: workoutTitle,
    helperLine,
    metaLine: workoutMeta,
    status,
    canStart: selectedIsToday,
  };
}

function getWorkoutRecordForDate(workouts, dateKey) {
  if (!Array.isArray(workouts) || !dateKey) return null;

  const statusRank = {
    active: 0,
    completed: 1,
    planned: 2,
    skipped: 3,
  };

  return workouts
    .filter(workout => workout && (workout.scheduledDate === dateKey || workout.plannedDate === dateKey))
    .slice()
    .sort((left, right) => {
      const rankDelta = (statusRank[left.status] ?? 99) - (statusRank[right.status] ?? 99);
      if (rankDelta !== 0) return rankDelta;
      return (right.createdAt || 0) - (left.createdAt || 0);
    })[0] ?? null;
}

function getWorkoutStateMeta({
  session,
  dateKey,
  workouts,
  todayKey,
  now,
}) {
  if (!session) {
    return {
      state: 'rest',
      label: 'Rest',
      className: 'status-planned',
      tileState: 'rest',
    };
  }

  const matchingWorkouts = Array.isArray(workouts)
    ? workouts.filter(workout => workout && (workout.scheduledDate === dateKey || workout.plannedDate === dateKey))
    : [];
  const hasCompleted = session.status === 'completed' || matchingWorkouts.some(workout => workout.status === 'completed');
  const hasSkipped = session.status === 'skipped' || matchingWorkouts.some(workout => workout.status === 'skipped');
  const hasActive = matchingWorkouts.some(workout => workout.status === 'active');
  const isToday = dateKey === todayKey;
  const isPast = dateKey < todayKey;
  const isLateToday = isToday && isWorkoutPastCutoff(now);

  if (hasCompleted) {
    return {
      state: 'done',
      label: 'Done',
      className: 'status-active',
      tileState: 'completed',
    };
  }

  if (hasSkipped || session.status === 'missed' || (isPast && !hasActive) || (isLateToday && !hasActive)) {
    return {
      state: 'missed',
      label: 'Missed',
      className: 'status-missed',
      tileState: 'missed',
    };
  }

  return {
    state: 'planned',
    label: 'Planned',
    className: 'status-planned',
    tileState: isToday ? 'today' : 'planned',
  };
}

function getFitnessProgressSnapshot({
  workouts,
  weeklySchedule,
  fitnessSettings,
  programType,
  todayKey,
}) {
  const normalizedProgramType = normalizeProgramType(programType);
  const plannedTargets = {
    hyrox: 12,
    '5k': 12,
    strength_block: 0,
  };
  const targetMiles = Number.isFinite(fitnessSettings.currentWeeklyMileage)
    ? fitnessSettings.currentWeeklyMileage
    : plannedTargets[normalizedProgramType] ?? 12;

  const currentWeekWorkouts = Array.isArray(weeklySchedule)
    ? weeklySchedule
    : [];

  const completedWorkoutCount = currentWeekWorkouts.filter(session => session.status === 'completed').length;
  const targetWorkouts = fitnessSettings.trainingDays === '3-day'
    ? 3
    : fitnessSettings.trainingDays === '5-day'
      ? 5
      : 4;

  const completedMiles = workouts
    .filter(workout => workout.status === 'completed' && getWorkoutProgramType(workout) === normalizedProgramType)
    .filter(workout => currentWeekWorkouts.some(session => session.dateKey === workout.scheduledDate || session.dateKey === workout.plannedDate))
    .reduce((total, workout) => total + (Number.isFinite(workout.distanceMiles) ? workout.distanceMiles : 0), 0);

  const strengthSessions = currentWeekWorkouts.filter(session => session.status === 'completed' && session.type === 'strength').length;
  const recoverySessions = currentWeekWorkouts.filter(session => session.status === 'completed' && session.type === 'recovery').length;

  return {
    workoutsCompleted: completedWorkoutCount,
    workoutsTarget: Math.max(currentWeekWorkouts.length, targetWorkouts),
    milesCompleted: completedMiles,
    milesTarget: targetMiles,
    strengthSessions,
    recoverySessions,
    hasSchedule: currentWeekWorkouts.length > 0,
    todayKey,
  };
}

function alignDateToAnchor(date, anchorDay) {
  const base = startOfDay(date);
  const targetIndex = WEEKDAY_INDEX[anchorDay] ?? 1;
  const currentIndex = base.getDay();
  const delta = (currentIndex - targetIndex + 7) % 7;
  return addDays(base, -delta);
}

function getGreeting(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function inferWorkoutProgram(workout) {
  const rawType = typeof workout?.type === 'string' ? workout.type.toLowerCase() : '';
  const rawName = `${workout?.programName || workout?.name || ''}`.toLowerCase();

  if (rawType === 'run') return 'running';
  if (['hyrox', 'strength', 'running', 'pilates', 'recovery', 'hybrid'].includes(rawType)) return rawType;
  if (rawName.includes('hyrox')) return 'hyrox';
  if (rawName.includes('strength block')) return 'strength_block';
  if (rawName.includes('pilates')) return 'pilates';
  if (rawName.includes('recover') || rawName.includes('mobility') || rawName.includes('stretch')) return 'recovery';
  if (rawName.includes('run')) return 'running';
  return 'strength';
}

function getWorkoutProgramType(workout) {
  const declaredProgram = workout?.programType || workout?.programId;
  if (declaredProgram) return normalizeProgramType(declaredProgram);

  const rawType = typeof workout?.type === 'string' ? workout.type.toLowerCase() : '';
  const rawName = `${workout?.programName || workout?.name || ''}`.toLowerCase();

  if (rawName.includes('5k') || rawType === 'run') return '5k';
  if (rawName.includes('strength block') || rawType === 'strength_block') return 'strength_block';
  if (rawName.includes('hyrox') || rawType === 'hyrox') return 'hyrox';
  return null;
}

function getWorkoutStats(workouts, now, programType) {
  const weekStart = alignDateToAnchor(now, 'Monday');
  const nextWeekStart = addDays(weekStart, 7);
  const previousWeekStart = addDays(weekStart, -7);

  const inRange = (workout, start, end) => {
    const createdAt = new Date(workout.createdAt);
    return createdAt >= start && createdAt < end;
  };

  const currentWeek = workouts.filter(workout => inRange(workout, weekStart, nextWeekStart));
  const previousWeek = workouts.filter(workout => inRange(workout, previousWeekStart, weekStart));

  const completedCurrent = currentWeek.filter(workout => workout.status === 'completed');
  const completedPrevious = previousWeek.filter(workout => workout.status === 'completed');
  const selectedCurrent = currentWeek.filter(workout => getWorkoutProgramType(workout) === programType);

  return {
    workoutsCompleted: completedCurrent.length,
    milesCompleted: completedCurrent.reduce((total, workout) => total + (Number.isFinite(workout.distanceMiles) ? workout.distanceMiles : 0), 0),
    strengthSessions: completedCurrent.filter(workout => ['strength', 'strength_block', 'hyrox', 'hybrid'].includes(inferWorkoutProgram(workout))).length,
    recoverySessions: completedCurrent.filter(workout => ['recovery', 'pilates'].includes(inferWorkoutProgram(workout))).length,
    workoutTrend: completedCurrent.length - completedPrevious.length,
    currentWeekWorkouts: selectedCurrent,
  };
}

function getSessionStations(session) {
  const focus = `${session?.type || ''} ${session?.title || ''} ${session?.detail || ''}`.toLowerCase();
  if (focus.includes('simulation') || focus.includes('full hyrox')) {
    return ALL_STATIONS.map(name => getStationMeta(name)).filter(Boolean);
  }
  if (focus.includes('lower')) {
    return ['Sled Push', 'Sled Pull', 'Sandbag Lunges', 'Farmers Carry']
      .map(name => getStationMeta(name))
      .filter(Boolean);
  }
  if (focus.includes('upper')) {
    return ['SkiErg', 'Row', 'Farmers Carry']
      .map(name => getStationMeta(name))
      .filter(Boolean);
  }
  if (focus.includes('station') || focus.includes('hyrox')) {
    return ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball']
      .map(name => getStationMeta(name))
      .filter(Boolean);
  }
  return [];
}

function getCurrentWorkoutType(workout) {
  if (!workout) return 'strength';
  return inferWorkoutProgram(workout);
}

function getWorkoutLifecycleLabel(status) {
  if (status === 'completed' || status === 'done') return 'Done';
  if (status === 'missed' || status === 'skipped') return 'Missed';
  return 'Planned';
}

function formatStructuredExerciseMeta(exercise) {
  if (!exercise) return '';

  return [
    Number.isFinite(exercise.sets) ? `${exercise.sets} sets` : null,
    exercise.reps ? `${exercise.reps} reps` : null,
    exercise.interval ? `Interval ${exercise.interval}` : null,
    exercise.timedEffort ? `Time ${exercise.timedEffort}` : null,
    exercise.distance || null,
    exercise.rest ? `Rest ${exercise.rest}` : null,
    exercise.effort || null,
  ].filter(Boolean).join(' · ');
}

function getStructuredBlockSummary(block) {
  if (!block) return '';
  if (block.duration) return block.duration;
  if (Number.isFinite(block.repeat)) return `${block.repeat} rounds`;
  if (block.type === 'warmup') return 'Warm-up';
  if (block.type === 'cooldown') return 'Cooldown';
  if (block.type === 'intervals') return 'Intervals';
  if (block.type === 'timed-effort') return 'Timed effort';
  if (block.type === 'recovery') return 'Recovery';
  return '';
}

function getStructuredWorkoutDetails(workout, programNameFallback = '') {
  if (!workout) return null;

  const content = buildWorkoutContentFromSession(workout);
  const dateValue = workout.date || workout.dateKey || workout.scheduledDate || workout.plannedDate || null;
  const duration = Number.isFinite(workout.plannedDurationMinutes)
    ? workout.plannedDurationMinutes
    : (Number.isFinite(workout.duration) ? workout.duration : null);

  return {
    name: workout.name || workout.label || workout.title || 'Workout',
    typeLabel: getProgramWorkoutTypeLabel(workout),
    programName: workout.programName || programNameFallback || getProgramDisplayName(workout.programType || workout.programId),
    programWeek: Number.isFinite(workout.programWeek) ? workout.programWeek : (Number.isFinite(workout.week) ? workout.week : null),
    dateKey: dateValue,
    dateLabel: workout.dateLabel || (dateValue ? formatDateLabel(dateValue) : null),
    scheduleLabel: workout.plannedLabel || [
      workout.plannedTime || workout.time || null,
      duration ? `${duration} min` : null,
    ].filter(Boolean).join(' · '),
    statusLabel: workout.statusLabel || getWorkoutLifecycleLabel(workout.status),
    notes: Array.isArray(content.notes) ? content.notes : [],
    blocks: Array.isArray(content.blocks) ? content.blocks : [],
    contentSummary: workout.contentSummary || {
      blockCount: Array.isArray(content.blocks) ? content.blocks.length : 0,
      exerciseCount: Array.isArray(content.blocks)
        ? content.blocks.reduce((total, block) => total + (Array.isArray(block.exercises) ? block.exercises.length : 0), 0)
        : 0,
      hasIntervals: Array.isArray(content.blocks)
        ? content.blocks.some(block => Array.isArray(block.exercises) && block.exercises.some(exercise => Boolean(exercise.interval)))
        : false,
      hasTimedEfforts: Array.isArray(content.blocks)
        ? content.blocks.some(block => Array.isArray(block.exercises) && block.exercises.some(exercise => Boolean(exercise.timedEffort || exercise.duration)))
        : false,
      hasNotes: Array.isArray(content.notes) ? content.notes.length > 0 : false,
    },
  };
}

function createWorkoutFromSession({
  createWorkout,
  createExercise,
  session,
  settings,
  todayKey,
  scheduledDateOverride = null,
  plannedDateOverride = null,
  statusOverride = 'planned',
}) {
  const sessionType = session?.type || 'hyrox';
  const normalizedProgramType = session?.programType || settings?.programType || 'hyrox';
  const programName = getProgramDisplayName(normalizedProgramType);
  const content = buildWorkoutContentFromSession(session);
  const prescribedExercises = Array.isArray(content.blocks) && content.blocks.length > 0
    ? content.blocks.flatMap(block => (
      Array.isArray(block.exercises) && block.exercises.length > 0
        ? block.exercises.map(exercise => createExercise({
            name: exercise.name || block.title || 'Exercise',
            detail: [exercise.detail, exercise.note].filter(Boolean).join(' · '),
            sets: Number.isFinite(exercise.sets) ? exercise.sets : block.repeat,
            reps: typeof exercise.reps === 'string' ? exercise.reps : null,
            interval: exercise.interval || null,
            timedEffort: exercise.timedEffort || block.duration || null,
            duration: exercise.duration || null,
            rest: exercise.rest || null,
            distance: exercise.distance || null,
            effort: exercise.effort || null,
            note: exercise.note || null,
            cue: exercise.cue || null,
          }))
        : [createExercise({
            name: block.title || 'Block',
            detail: Array.isArray(block.notes) ? block.notes[0] || '' : '',
            sets: block.repeat,
            timedEffort: block.duration || null,
          })]
    ))
    : [
      createExercise({ name: 'Warm-up', detail: '5-10 min easy movement', timedEffort: '5-10 min' }),
      createExercise({ name: session.title || session.label || 'Main set', detail: session.detail || session.label || 'Training session', sets: 3 }),
      createExercise({ name: 'Cooldown', detail: '5 min mobility', timedEffort: '5 min' }),
    ];
  const scheduledDate = scheduledDateOverride || session?.dateKey || todayKey;
  const plannedDate = plannedDateOverride || session?.dateKey || scheduledDate;
  const plannedDurationMinutes = Number.isFinite(session?.plannedDurationMinutes)
    ? session.plannedDurationMinutes
    : (Number.isFinite(session?.duration) ? session.duration : null);
  const workout = createWorkout({
    name: session.label || session.title || 'Training Session',
    title: session.label || session.title || 'Training Session',
    label: session.label || session.title || 'Training Session',
    detail: session.detail || '',
    objective: session.objective || session.shortVersionRule || '',
    programId: normalizedProgramType,
    programName,
    type: sessionType.includes('run')
      ? 'run'
      : sessionType.includes('hyrox')
        ? 'hyrox'
        : sessionType.includes('recovery')
          ? 'recovery'
          : 'strength',
    status: statusOverride,
    scheduledDate,
    plannedDate,
    date: scheduledDate,
    sessionOffset: session.offset ?? null,
    trainingDays: settings.trainingDays,
    programType: normalizedProgramType,
    phase: session.phase || '',
    week: session.week || null,
    programWeek: Number.isFinite(session?.programWeek) ? session.programWeek : (Number.isFinite(session?.week) ? session.week : null),
    duration: plannedDurationMinutes || 45,
    plannedDurationMinutes: plannedDurationMinutes || 45,
    plannedTime: session.plannedTime || null,
    sessionType: session.sessionType || null,
    sessionTypeCanonical: session.sessionTypeCanonical || null,
    warmupTemplateId: session.warmupTemplateId || null,
    cooldownTemplateId: session.cooldownTemplateId || null,
    shortVersionRule: session.shortVersionRule || null,
    prescription: session.prescription || null,
    coachingNote: session.coachingNotes || session.coachingNote || null,
    exercises: prescribedExercises,
    content,
    source: {
      origin: 'program',
      importKey: session.id || session.workoutKey || session.workoutId || null,
      templateId: session.warmupTemplateId || session.cooldownTemplateId || null,
      libraryId: session.workoutId || session.workoutKey || session.id || null,
      sessionType: session.sessionType || session.sessionTypeCanonical || session.type || null,
    },
  });

  return {
    ...workout,
    type: workout.type || 'hyrox',
  };
}

function getTodayItems({ tasks, workouts, meals, calendarItems, todayKey }) {
  return [
    ...tasks.filter(task => task.status !== 'done').slice(0, 3).map(task => ({
      id: task.id,
      kind: 'task',
      title: task.title || 'Untitled task',
      sub: task.priority ? 'Priority task' : 'Task',
    })),
    ...workouts.filter(workout => workout.status !== 'completed' && (!workout.scheduledDate || workout.scheduledDate === todayKey)).slice(0, 3).map(workout => ({
      id: workout.id,
      kind: 'workout',
      title: workout.name,
      sub: `${workout.status} · ${workout.duration || 30} min`,
    })),
    ...meals.filter(meal => toDateKey(meal.loggedAt) === todayKey).slice(0, 3).map(meal => ({
      id: meal.id,
      kind: 'meal',
      title: meal.name,
      sub: Array.isArray(meal.tags) && meal.tags.length ? meal.tags.join(' · ') : 'Meal log',
    })),
    ...calendarItems.filter(item => item.date === todayKey).slice(0, 3).map(item => ({
      id: item.id,
      kind: 'calendar',
      title: item.title,
      sub: `${item.startTime} - ${item.endTime}`,
    })),
  ];
}

function daysUntilDue(lastDone, intervalDays) {
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return null;
  if (!lastDone) return -intervalDays;

  const last = new Date(lastDone);
  const due = new Date(last.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  return Math.round((due - now) / (24 * 60 * 60 * 1000));
}

function getMaintenanceSnapshot(history = {}) {
  const items = Object.values(history).filter(item => item && typeof item === 'object');
  const resolved = items.map(item => ({
    ...item,
    daysRemaining: daysUntilDue(item.lastDone, Number.parseInt(item.intervalDays, 10)),
  }));

  const overdue = resolved.filter(item => typeof item.daysRemaining === 'number' && item.daysRemaining < 0);
  const dueSoon = resolved.filter(item => typeof item.daysRemaining === 'number' && item.daysRemaining >= 0 && item.daysRemaining <= 7);
  const nextItem = [...resolved]
    .sort((left, right) => {
      const leftDays = typeof left.daysRemaining === 'number' ? left.daysRemaining : 999;
      const rightDays = typeof right.daysRemaining === 'number' ? right.daysRemaining : 999;
      return leftDays - rightDays;
    })[0] || null;

  return {
    items: resolved,
    overdue,
    dueSoon,
    nextItem,
  };
}

function getFinanceSnapshot(profile) {
  const transactions = Array.isArray(profile?.transactions) ? profile.transactions : [];
  const recurringExpenses = Array.isArray(profile?.recurringExpenses) ? profile.recurringExpenses : [];
  const financialAccounts = Array.isArray(profile?.financialAccounts) ? profile.financialAccounts : [];

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
  const monthTx = transactions.filter(tx => tx.date >= monthStart && tx.date < monthEnd);

  const income = monthTx.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
  const expenses = monthTx.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
  const subscriptionTotal = recurringExpenses.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
  const activeBalance = financialAccounts.filter(account => account.isActive).reduce((sum, account) => sum + (account.balance ?? 0), 0);

  return {
    income,
    expenses,
    net: income - expenses,
    subscriptionTotal,
    activeBalance,
    unreviewed: monthTx.length,
  };
}

function formatSignedNumber(value) {
  const rounded = Math.round(value ?? 0);
  return `${rounded >= 0 ? '+' : '-'}${Math.abs(rounded)}`;
}

const workCalendarCardStyle = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
  boxShadow: 'var(--shadow)',
};

const workCalendarHeaderButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
};

const workCalendarTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const workCalendarChevronStyle = {
  color: 'var(--text-secondary)',
  fontSize: 16,
  lineHeight: 1,
};

const workCalendarContentWrapStyle = {
  marginTop: 12,
  paddingTop: 12,
  borderTop: '0.5px solid var(--border)',
};

const workCalendarHelperTextStyle = {
  fontSize: 12,
  color: 'var(--text-secondary)',
  marginBottom: 12,
  lineHeight: 1.6,
};

const workCalendarMiniLabelStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-primary)',
  marginBottom: 6,
};

const workCalendarPriorityRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 0',
  borderBottom: '0.5px solid var(--border)',
};

const workCalendarBadgeStyle = {
  width: 18,
  height: 18,
  borderRadius: '50%',
  color: 'var(--white)',
  fontSize: 10,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const workCalendarRowTextStyle = {
  fontSize: 12,
  color: 'var(--text-primary)',
};

const workCalendarSecondaryHelperStyle = {
  marginTop: 12,
  fontSize: 11,
  color: 'var(--text-secondary)',
  lineHeight: 1.5,
};

const workCalendarSmallHeadingStyle = {
  marginTop: 10,
  marginBottom: 4,
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-primary)',
};

const workCalendarEmptyStateStyle = {
  fontSize: 11,
  color: 'var(--text-secondary)',
};

const WORK_CALENDAR_PRIORITY_ROWS = [
  { n: 1, label: 'Fixed Google events', bg: 'var(--primary)' },
  { n: 2, label: 'Manual busy blocks', bg: 'var(--warning)' },
  { n: 3, label: 'Meal prep', bg: 'var(--success)' },
  { n: 4, label: 'Workout', bg: 'var(--success)' },
  { n: 5, label: 'Tasks', bg: 'var(--text-secondary)' },
];

function formatBusyBlockSummary(item) {
  const title = typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : 'Busy block';
  const date = typeof item?.date === 'string' ? item.date : '';
  const startTime = typeof item?.startTime === 'string' ? item.startTime : '';
  const endTime = typeof item?.endTime === 'string' ? item.endTime : '';

  if (date && startTime && endTime) {
    return `${title} · ${date} ${startTime}-${endTime}`;
  }

  if (startTime && endTime) {
    return `${title} · ${startTime}-${endTime}`;
  }

  return title;
}

function WorkCalendarAccordionCard({ busyBlocks }) {
  const [expanded, setExpanded] = useState(true);
  const busyBlockSummary = busyBlocks.length === 0
    ? 'None yet. Go to Calendar to add blocks.'
    : busyBlocks.map(formatBusyBlockSummary).join(' | ');

  return (
    <div style={workCalendarCardStyle}>
      <button
        type="button"
        style={workCalendarHeaderButtonStyle}
        onClick={() => setExpanded(current => !current)}
      >
        <span style={workCalendarTitleStyle}>Work Calendar</span>
        <span style={workCalendarChevronStyle}>{expanded ? '^' : '⌄'}</span>
      </button>

      {expanded && (
        <div style={workCalendarContentWrapStyle}>
          <div style={workCalendarHelperTextStyle}>
            Manually enter work-unavailable windows so the app can plan workouts, meals, and tasks around them. Busy blocks are locked — the planner treats them like fixed meetings.
          </div>

          <div style={workCalendarMiniLabelStyle}>Priority order</div>

          {WORK_CALENDAR_PRIORITY_ROWS.map(item => (
            <div key={item.n} style={workCalendarPriorityRowStyle}>
              <span style={{ ...workCalendarBadgeStyle, background: item.bg }}>{item.n}</span>
              <span style={workCalendarRowTextStyle}>{item.label}</span>
            </div>
          ))}

          <div style={workCalendarSecondaryHelperStyle}>
            Add busy blocks from the Calendar tab. Use the quick presets for common patterns, or save a weekly pattern and apply it each Sunday.
          </div>

          <div style={workCalendarSmallHeadingStyle}>Current busy blocks</div>
          <div style={workCalendarEmptyStateStyle}>{busyBlockSummary}</div>
        </div>
      )}
    </div>
  );
}

function SettingsScreen() {
  const {
    fitnessSettings,
    setFitnessSettings,
    mealPrefs,
    setMealPrefs,
    notificationPrefs,
    setNotificationPrefs,
    recoveryInputs,
    setRecoveryInputs,
  } = useAppContext();
  const { calendarItems } = useTaskContext();
  const { profile, updateAthlete } = useProfileContext();

  const [draft, setDraft] = useState(() => ({ ...fitnessSettings }));
  const [athleteDraft, setAthleteDraft] = useState(() => ({ ...profile.athlete }));
  const [saveBanner, setSaveBanner] = useState('');
  const saveBannerTimerRef = useRef(null);
  const fieldVisibility = getProgramFieldVisibility(draft.programType);

  useEffect(() => {
    setDraft({ ...fitnessSettings });
    setAthleteDraft({ ...profile.athlete });
  }, [fitnessSettings, profile.athlete]);

  useEffect(() => () => {
    if (saveBannerTimerRef.current) {
      clearTimeout(saveBannerTimerRef.current);
    }
  }, []);

  const weakStations = Array.isArray(athleteDraft.weakStations) ? athleteDraft.weakStations : [];
  const strongStations = Array.isArray(athleteDraft.strongStations) ? athleteDraft.strongStations : [];
  const busyCalendarBlocks = useMemo(
    () => calendarItems.filter(item => item.type === 'busy'),
    [calendarItems],
  );

  function patch(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function patchAthlete(key, value) {
    setAthleteDraft(current => ({ ...current, [key]: value }));
  }

  function toggleStation(key, field = 'weakStations') {
    setAthleteDraft(current => {
      const active = Array.isArray(current[field]) ? current[field] : [];
      return {
        ...current,
        [field]: active.includes(key) ? active.filter(station => station !== key) : [...active, key],
      };
    });
  }

  function save() {
    setFitnessSettings(current => ({ ...current, ...draft }));
    updateAthlete(athleteDraft);
    setSaveBanner('Settings saved.');
    if (saveBannerTimerRef.current) {
      clearTimeout(saveBannerTimerRef.current);
    }
    saveBannerTimerRef.current = setTimeout(() => {
      setSaveBanner('');
      saveBannerTimerRef.current = null;
    }, 2500);
  }

  const settingsSections = [
    { id: 'programSetup', label: 'Fitness Profile' },
    { id: 'athleteProfile', label: 'Athlete Profile' },
    { id: 'workCalendar', label: 'Work Calendar' },
    { id: 'nutrition', label: 'Nutrition' },
    { id: 'recoveryCalendar', label: 'Recovery + Calendar' },
    { id: 'notifications', label: 'Notifications' },
  ];

  const sectionContent = {
    programSetup: (
      <div className="field-stack">
        <div className="field-stack compact-field">
          <span>Fitness Program</span>
          <div className="segmented-control settings-pills">
            {AVAILABLE_PROGRAMS.map(program => (
              <button
                key={program.id}
                type="button"
                className={`status-chip ${draft.programType === program.id ? 'is-active' : ''}`}
                onClick={() => patch('programType', program.id)}
              >
                {program.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-stack compact-field">
          <span>Timeline</span>
          {fieldVisibility.showRaceDate && (
            <label className="field-stack compact-field">
              <span>Race Date</span>
              <input
                type="date"
                className="task-title-input settings-input"
                value={draft.raceDate ?? ''}
                onChange={e => patch('raceDate', e.target.value || null)}
              />
            </label>
          )}
          <label className="field-stack compact-field">
            <span>Plan Start Date</span>
            <input
              type="date"
              className="task-title-input settings-input"
              value={draft.programStartDate ?? ''}
              onChange={e => patch('programStartDate', e.target.value || new Date().toISOString().slice(0, 10))}
            />
          </label>
          <div className="subtle-feed">
            {fieldVisibility.showRaceName && (
              <input
                type="text"
                className="task-title-input"
                placeholder="Race name"
                value={draft.raceName}
                onChange={e => patch('raceName', e.target.value)}
              />
            )}
            {fieldVisibility.showRaceCategory && (
              <input
                type="text"
                className="task-title-input"
                placeholder="Race category"
                value={draft.raceCategory}
                onChange={e => patch('raceCategory', e.target.value)}
              />
            )}
            {fieldVisibility.showGoalFinishTime && (
              <input
                type="text"
                className="task-title-input"
                placeholder="Goal finish time"
                value={draft.goalFinishTime}
                onChange={e => patch('goalFinishTime', e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="field-stack compact-field">
          <span>Training Structure</span>
          <label className="field-stack compact-field">
            <span>Training days per week</span>
            <div className="segmented-control settings-pills">
              {(draft.programType === '5k' ? ['3-day', '4-day', '5-day'] : ['4-day', '5-day']).map(freq => (
                <button
                  key={freq}
                  type="button"
                  className={`status-chip ${draft.trainingDays === freq ? 'is-active' : ''}`}
                  onClick={() => patch('trainingDays', freq)}
                >
                  {freq}
                </button>
              ))}
            </div>
          </label>
          <label className="field-stack compact-field">
            <span>Equipment access</span>
            <div className="segmented-control settings-pills">
              {['full-gym', 'limited', 'bodyweight-only'].map(eq => (
                <button
                  key={eq}
                  type="button"
                  className={`status-chip ${draft.equipmentAccess === eq ? 'is-active' : ''}`}
                  onClick={() => patch('equipmentAccess', eq)}
                >
                  {eq}
                </button>
              ))}
            </div>
          </label>
          {fieldVisibility.showCurrentWeeklyMileage && (
            <label className="field-stack compact-field">
              <span>Current weekly mileage</span>
              <input
                type="number"
                min="0"
                className="task-title-input settings-input"
                value={draft.currentWeeklyMileage ?? ''}
                onChange={e => patch('currentWeeklyMileage', e.target.value === '' ? null : Number(e.target.value))}
              />
            </label>
          )}
          <label className="field-stack compact-field">
            <span>Injuries or limitations</span>
            <textarea
              className="task-title-input settings-input"
              rows={3}
              value={draft.injuriesOrLimitations}
              onChange={e => patch('injuriesOrLimitations', e.target.value)}
            />
          </label>
        </div>
      </div>
    ),
    athleteProfile: (
      <div className="field-stack">
        <label className="field-stack compact-field">
          <span>Fitness level</span>
          <div className="segmented-control">
            {['beginner', 'intermediate', 'advanced'].map(level => (
              <button
                key={level}
                type="button"
                className={`status-chip ${athleteDraft.fitnessLevel === level ? 'is-active' : ''}`}
                onClick={() => patchAthlete('fitnessLevel', level)}
              >
                {level}
              </button>
            ))}
          </div>
        </label>
        <label className="field-stack compact-field">
          <span>Age</span>
          <input
            type="number"
            min="0"
            className="task-title-input"
            value={athleteDraft.age ?? ''}
            onChange={e => patchAthlete('age', e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Body weight</span>
          <div className="segmented-control">
            {['kg', 'lbs'].map(unit => (
              <button
                key={unit}
                type="button"
                className={`status-chip ${athleteDraft.bodyWeightUnit === unit ? 'is-active' : ''}`}
                onClick={() => patchAthlete('bodyWeightUnit', unit)}
              >
                {unit}
              </button>
            ))}
          </div>
          <input
            type="number"
            min="0"
            className="task-title-input"
            value={athleteDraft.bodyWeight ?? ''}
            onChange={e => patchAthlete('bodyWeight', e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Biological sex</span>
          <div className="segmented-control">
            {['male', 'female', 'other'].map(sex => (
              <button
                key={sex}
                type="button"
                className={`status-chip ${athleteDraft.biologicalSex === sex ? 'is-active' : ''}`}
                onClick={() => patchAthlete('biologicalSex', sex)}
              >
                {sex}
              </button>
            ))}
          </div>
        </label>
        <label className="field-stack compact-field">
          <span>Squat 5RM</span>
          <input
            type="number"
            min="0"
            className="task-title-input"
            value={athleteDraft.squat5RM ?? ''}
            onChange={e => patchAthlete('squat5RM', e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Deadlift 5RM</span>
          <input
            type="number"
            min="0"
            className="task-title-input"
            value={athleteDraft.deadlift5RM ?? ''}
            onChange={e => patchAthlete('deadlift5RM', e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Sweat rate</span>
          <input
            type="number"
            min="0"
            className="task-title-input"
            value={athleteDraft.sweatRate ?? ''}
            onChange={e => patchAthlete('sweatRate', e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Strong stations</span>
          <div className="tag-row">
            {ALL_STATIONS.map(station => (
              <button
                key={station}
                type="button"
                className={`status-chip ${strongStations.includes(station) ? 'is-active' : ''}`}
                onClick={() => toggleStation(station, 'strongStations')}
              >
                {station}
              </button>
            ))}
          </div>
        </label>
        <label className="field-stack compact-field">
          <span>Weak stations</span>
          <div className="tag-row">
            {ALL_STATIONS.map(station => (
              <button
                key={station}
                type="button"
                className={`status-chip ${weakStations.includes(station) ? 'is-active' : ''}`}
                onClick={() => toggleStation(station, 'weakStations')}
              >
                {station}
              </button>
            ))}
          </div>
        </label>
      </div>
    ),
    workCalendar: (
      <WorkCalendarAccordionCard busyBlocks={busyCalendarBlocks} />
    ),
    nutrition: (
      <div className="field-stack">
        <label className="field-stack compact-field">
          <span>Hydration goal (cups)</span>
          <input
            type="number"
            min="1"
            max="20"
            className="task-title-input"
            value={mealPrefs.hydrationGoal}
            onChange={e => setMealPrefs(p => ({ ...p, hydrationGoal: Number(e.target.value) }))}
          />
        </label>
        <label className="field-stack compact-field">
          <span>Dietary notes</span>
          <textarea
            className="task-title-input"
            rows={3}
            value={mealPrefs.dietaryNotes}
            onChange={e => setMealPrefs(p => ({ ...p, dietaryNotes: e.target.value }))}
          />
        </label>
      </div>
    ),
    recoveryCalendar: (
      <div className="field-stack">
        <label className="field-stack compact-field">
          <span>Preferred recovery session</span>
          <div className="segmented-control">
            {RECOVERY_SESSIONS.map(session => (
              <button
                key={session.id}
                type="button"
                className={`status-chip ${recoveryInputs.preferredSession === session.id ? 'is-active' : ''}`}
                onClick={() => setRecoveryInputs(current => ({ ...current, preferredSession: session.id }))}
              >
                {session.name}
              </button>
            ))}
          </div>
        </label>
        <label className="field-stack compact-field">
          <span>Recovery focus</span>
          <input
            type="text"
            className="task-title-input"
            value={recoveryInputs.lastRecoveryFocus}
            onChange={e => setRecoveryInputs(current => ({ ...current, lastRecoveryFocus: e.target.value }))}
          />
        </label>
      </div>
    ),
    notifications: (
      <div className="field-stack">
        <label className="field-stack compact-field">
          <span>Morning reminder</span>
          <div className="segmented-control">
            <button
              type="button"
              className={`status-chip ${notificationPrefs.morningReminder ? 'is-active' : ''}`}
              onClick={() => setNotificationPrefs(current => ({ ...current, morningReminder: !current.morningReminder }))}
            >
              {notificationPrefs.morningReminder ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </label>
        <label className="field-stack compact-field">
          <span>Workout reminder</span>
          <div className="segmented-control">
            <button
              type="button"
              className={`status-chip ${notificationPrefs.workoutReminder ? 'is-active' : ''}`}
              onClick={() => setNotificationPrefs(current => ({ ...current, workoutReminder: !current.workoutReminder }))}
            >
              {notificationPrefs.workoutReminder ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </label>
      </div>
    ),
  };

  return (
    <div className="tab-stack settings-page">
      <Card>
        <SectionHeader eyebrow="Settings" title="Settings" />
      </Card>

      {saveBanner ? (
        <div className="settings-save-banner" role="status" aria-live="polite">
          {saveBanner}
        </div>
      ) : null}

      <div className="settings-stack">
        {settingsSections.map((section, index) => (
          <React.Fragment key={section.id}>
            {section.id === 'workCalendar' ? (
              sectionContent[section.id]
            ) : (
              <ExpandablePanel header={<strong>{section.label}</strong>} defaultOpen={index === 0} className="settings-card">
                {sectionContent[section.id]}
              </ExpandablePanel>
            )}
            {index === 0 && <div className="settings-section-divider" aria-hidden="true" />}
          </React.Fragment>
        ))}
      </div>

      <Card>
        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={save}>
            Save settings
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setDraft({ ...fitnessSettings });
              setAthleteDraft({ ...profile.athlete });
            }}
          >
            Reset unsaved
          </button>
        </div>
      </Card>
    </div>
  );
}

function TasksScreen() {
  const { tasks, setTasks, createTask, createSubtask } = useTaskContext();
  const [draftTitle, setDraftTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const visibleTasks = useMemo(
    () => (showCompleted ? tasks : tasks.filter(task => task.status !== 'done')),
    [showCompleted, tasks],
  );

  const taskStats = useMemo(() => ({
    active: tasks.filter(task => task.status === 'active').length,
    planned: tasks.filter(task => task.status === 'planned').length,
    done: tasks.filter(task => task.status === 'done').length,
    priority: tasks.filter(task => task.priority).length,
  }), [tasks]);

  function addTask() {
    const title = draftTitle.trim();
    if (!title) return;
    setTasks(current => [createTask({ title, status: 'active', priority: true, subtasks: [createSubtask('')] }), ...current]);
    setDraftTitle('');
  }

  function updateTask(taskId, patch) {
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, ...patch } : task)));
  }

  function deleteTask(taskId) {
    setTasks(current => current.filter(task => task.id !== taskId));
  }

  function toggleDone(taskId) {
    setTasks(current => current.map(task => {
      if (task.id !== taskId) return task;
      return { ...task, status: task.status === 'done' ? 'planned' : 'done' };
    }));
  }

  function toggleSubtask(taskId, subtaskId) {
    setTasks(current => current.map(task => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        subtasks: task.subtasks.map(subtask => (
          subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
        )),
      };
    }));
  }

  function addSubtask(taskId) {
    setTasks(current => current.map(task => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        subtasks: [...task.subtasks, createSubtask('')],
      };
    }));
  }

  function setStatus(taskId, status) {
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, status } : task)));
  }

  return (
    <div className="tab-stack">
      <Card>
        <SectionHeader eyebrow="Tasks" title="Execution list" />
        <div className="ui-metrics-row">
          <MetricBlock value={taskStats.active} label="Active" />
          <MetricBlock value={taskStats.planned} label="Planned" />
          <MetricBlock value={taskStats.done} label="Done" />
          <MetricBlock value={taskStats.priority} label="Priority" />
        </div>
        <div className="inline-task-form">
          <input
            className="task-title-input"
            placeholder="Add a task"
            value={draftTitle}
            onChange={event => setDraftTitle(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTask();
              }
            }}
          />
          <button type="button" className="primary-button" onClick={addTask}>
            Add
          </button>
        </div>
        <button type="button" className="ghost-button compact-ghost" onClick={() => setShowCompleted(current => !current)}>
          {showCompleted ? 'Hide completed' : 'Show completed'}
        </button>
      </Card>

      <div className="execution-list">
        {visibleTasks.length === 0 ? (
          <Card>
            <EmptyState
              title="No tasks yet"
              description="Capture a few priorities, then move them through execution."
            />
          </Card>
        ) : (
          visibleTasks.map(task => (
            <ExecutionTaskItem
              key={task.id}
              task={task}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onToggleDone={toggleDone}
              onToggleSubtask={toggleSubtask}
              onAddSubtask={addSubtask}
              onSetStatus={setStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TodayScreen({
  now,
  activeWorkoutId,
  onSwitchToFitness,
  onOpenMoreSection,
  onOpenInbox,
  onStartWorkout,
}) {
  const { workouts, meals } = useTaskContext();
  const { fitnessSettings, energyState, mealPrefs } = useAppContext();
  const { profile } = useProfileContext();

  const todayKey = toDateKey(now);
  const athleteDefaults = profile?.athlete || {};
  const workoutHistory = useMemo(
    () => workouts.map(workout => ({
      ...workout,
      plannedDate: workout.plannedDate || workout.scheduledDate || null,
    })),
    [workouts],
  );
  const planState = useMemo(
    () => getPlanState({
      startDate: fitnessSettings.programStartDate,
      trainingDays: fitnessSettings.trainingDays,
      programType: fitnessSettings.programType,
      today: now,
      history: workoutHistory,
      athleteDefaults,
    }),
    [athleteDefaults, fitnessSettings.programStartDate, fitnessSettings.programType, fitnessSettings.trainingDays, now, workoutHistory],
  );

  const todaysWorkout = useMemo(
    () => planState.sessions.find(session => session.status === 'today' || (session.status === 'moved' && session.movedToDate === todayKey)) ?? null,
    [planState.sessions, todayKey],
  );

  const activeWorkout = useMemo(
    () => (activeWorkoutId ? workouts.find(workout => workout.id === activeWorkoutId) ?? null : null),
    [activeWorkoutId, workouts],
  );

  const todaysMeals = useMemo(() => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey), [meals, todayKey]);
  const mealCount = useMemo(
    () => todaysMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('water')).length,
    [todaysMeals],
  );
  const hydrationCount = todaysMeals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('water')).length;
  const readiness = computeRecoveryState({ energyScore: energyState.value, sleepHours: energyState.sleepHours }, energyState.value, energyState.sleepHours);
  const daysToRace = fitnessSettings.raceDate
    ? Math.max(0, Math.round((startOfDay(`${fitnessSettings.raceDate}T00:00:00`) - startOfDay(now)) / 86_400_000))
    : null;
  const planWorkout = useMemo(() => {
    if (!todaysWorkout) return null;
    const sessionName = todaysWorkout.label || todaysWorkout.title || 'Today\'s workout';
    return adjustWorkoutForRecovery({
      id: todaysWorkout.id || `session-${todayKey}`,
      name: sessionName,
      title: todaysWorkout.title || sessionName,
      type: todaysWorkout.type || 'hyrox',
      duration: todaysWorkout.duration || 45,
      ex: todaysWorkout.ex || [],
    }, readiness);
  }, [readiness, todayKey, todaysWorkout]);

  const workoutName = planWorkout?.originalName || planWorkout?.name || 'Recovery reset';
  const workoutDuration = planWorkout?.duration ? `${planWorkout.duration} min` : '20 min';
  const workoutStatus = planWorkout?.adjustmentLabel === 'Reduced Volume'
    ? 'Reduced volume'
    : planWorkout?.adjustmentLabel === 'Recovery Replacement'
      ? 'Recovery replacement'
      : planWorkout?.adjustmentLabel === 'Planned Session'
        ? 'Planned session'
        : (todaysWorkout ? 'Planned session' : 'Recovery day');
  const workoutDetail = planWorkout?.originalName
    ? 'Reduced volume to keep the day moving.'
    : todaysWorkout
      ? `${planState.phase.name} phase · ${planState.label}`
      : 'Use a recovery session to keep momentum on non-training days.';
  const todaySuggestions = useMemo(
    () => getRecoveryAwareWorkoutSuggestions(todaysWorkout, readiness, athleteDefaults),
    [athleteDefaults, readiness, todaysWorkout],
  );
  const weeklyStrip = useMemo(
    () => planState.sessions.map(session => ({
      id: session.id || `${session.dateKey}-${session.label}`,
      day: session.dayLabel,
      label: session.label,
      status: session.status,
    })),
    [planState.sessions],
  );

  const workoutLaunch = () => {
    if (onStartWorkout && (todaysWorkout || planWorkout)) {
      onStartWorkout({
        label: planWorkout?.name || workoutName,
        title: planWorkout?.originalName || planWorkout?.name || workoutName,
        type: planWorkout?.type || todaysWorkout?.type || 'hyrox',
        duration: planWorkout?.duration || todaysWorkout?.duration || 45,
        offset: todaysWorkout?.offset ?? null,
        phase: todaysWorkout?.phase || '',
        week: todaysWorkout?.week || null,
      });
      return;
    }
    onSwitchToFitness();
  };

  const habitList = Array.isArray(profile.habits) ? profile.habits : [];
  const completedHabits = habitList.filter(habit => Array.isArray(habit.completedDates) && habit.completedDates.includes(todayKey));
  const habitPreview = habitList.slice(0, 2);
  const todayWorkoutDone = workouts.some(workout => workout.scheduledDate === todayKey && workout.status === 'completed');
  const proteinGoalMet = todaysMeals.reduce((total, meal) => total + (Number.isFinite(meal.protein) ? meal.protein : 0), 0) >= (mealPrefs.proteinGoal || 150);
  const hydrationGoalMet = hydrationCount >= mealPrefs.hydrationGoal;
  const recoveryDone = Number.isFinite(energyState.sleepHours) && energyState.sleepHours >= 7;
  const winTheDayChecklist = [
    { id: 'workout', label: 'Workout', done: todayWorkoutDone },
    { id: 'protein', label: 'Protein goal', done: proteinGoalMet },
    { id: 'hydration', label: 'Hydration', done: hydrationGoalMet },
    { id: 'recovery', label: 'Recovery', done: recoveryDone },
  ];
return (
  <div className="tab-stack today-dashboard">
    <section className="today-topbar">
      <div>
        <h1 className="today-page-title">{now.toLocaleDateString('en-US', { weekday: 'long' })}</h1>
        <p className="today-page-subtitle">
          {planState.phase?.name || 'Base'} · week {planState.week} · {planState.label || 'week'}
        </p>
      </div>
      <div className="today-race-pill">
        {daysToRace === null ? 'Race not set' : `${daysToRace}d to race`}
      </div>
    </section>

    <section className="task-card today-action-card">
      <p className="eyebrow">Do this now</p>
      <button type="button" className="today-primary-action" onClick={workoutLaunch}>
        <span>{activeWorkout ? "Continue today's workout" : `Start today's ${workoutName.toLowerCase()}`}</span>
        <span aria-hidden="true">›</span>
      </button>
    </section>

    <section className="task-card today-main-workout-card">
      <div className="today-chip-row">
        <span className="today-chip today-chip-soft">
          {planState.phase?.name || 'Base'} · wk {planState.week}
        </span>
        <span className="today-chip today-chip-warm">
          {planState.label || 'Week plan'}
        </span>
        <span className="today-chip">
          {todaysWorkout?.typeLabel || 'Workout'}
        </span>
      </div>

      <h2 className="today-main-title">{workoutName}</h2>
      <p className="today-main-subtitle">{workoutDetail}</p>
      <p className="today-main-duration">{workoutDuration}</p>

      <div className="today-main-actions">
        <button type="button" className="today-log-button" onClick={workoutLaunch}>
          {activeWorkout ? 'Continue workout' : 'Log this workout'}
        </button>
        <button
          type="button"
          className="today-secondary-inline"
          onClick={() => onOpenMoreSection?.('tasks')}
        >
          Add to Calendar
        </button>
      </div>
    </section>

    <section className="today-win-block">
      <p className="eyebrow">Win the day</p>

      <div className="today-win-grid">
        <div className="today-win-card">
          <div className="today-win-icon">{todayWorkoutDone ? '✓' : '○'}</div>
          <div>
            <strong>Workout</strong>
            <p>{todayWorkoutDone ? 'completed' : 'pending'}</p>
          </div>
        </div>

        <div className="today-win-card">
          <div className="today-win-icon">{proteinGoalMet ? '✓' : '○'}</div>
          <div>
            <strong>Protein</strong>
            <p>
              {todaysMeals.reduce((total, meal) => total + (Number.isFinite(meal.protein) ? meal.protein : 0), 0)}g
              {' / '}
              {mealPrefs.proteinGoal || 150}g
            </p>
          </div>
        </div>
      </div>

      <div className="today-win-wide">
        <div className="today-win-icon">{hydrationGoalMet ? '✓' : '○'}</div>
        <div className="today-win-wide-copy">
          <div className="today-win-wide-top">
            <strong>Hydration</strong>
            <span>{hydrationCount} / {mealPrefs.hydrationGoal}</span>
          </div>
          <div className="today-progress-track">
            <span
              style={{
                width: `${Math.min(100, Math.round((hydrationCount / Math.max(mealPrefs.hydrationGoal || 1, 1)) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="today-win-wide">
        <div className="today-win-icon">{recoveryDone ? '✓' : '○'}</div>
        <div className="today-win-wide-copy">
          <div className="today-win-wide-top">
            <div>
              <strong>Recovery</strong>
              <p>{recoveryDone ? 'logged today' : 'not yet logged today'}</p>
            </div>
            <button
              type="button"
              className="today-inline-pill-button"
              onClick={() => onOpenMoreSection?.('recovery')}
            >
              start →
            </button>
          </div>
        </div>
      </div>
    </section>

    <section className="today-countdown-row">
      <div className="today-countdown-pill">
        <strong>{daysToRace === null ? '—' : daysToRace}</strong>
        <span>{fitnessSettings.raceName ? ` days to ${fitnessSettings.raceName}` : ' days to race'}</span>
      </div>
    </section>

    <section className="today-week-section">
      <div className="today-week-metrics">
        <div className="today-metric-card today-metric-soft">
          <strong>
            {workouts
              .filter(workout => workout.status === 'completed' && getWorkoutProgramType(workout) === normalizeProgramType(fitnessSettings.programType))
              .reduce((total, workout) => total + (Number.isFinite(workout.distanceMiles) ? workout.distanceMiles : 0), 0)}
          </strong>
          <span>Miles</span>
        </div>

        <div className="today-metric-card today-metric-blue">
          <strong>{workouts.filter(workout => workout.status === 'completed' && getWorkoutProgramType(workout) === normalizeProgramType(fitnessSettings.programType)).length}</strong>
          <span>Sessions</span>
        </div>

        <div className="today-metric-card today-metric-neutral">
          <strong>
            {workouts
              .filter(workout => workout.status === 'completed' && getWorkoutProgramType(workout) === normalizeProgramType(fitnessSettings.programType))
              .reduce((total, workout) => total + (Number.isFinite(workout.duration) ? workout.duration : 0), 0)} min
          </strong>
          <span>Time</span>
        </div>
      </div>

      <div className="today-week-strip-wrap">
        <div className="today-week-strip-label">this week</div>
        <div className="today-week-strip-circles">
          {weeklyStrip.map(day => (
            <div key={day.id} className="today-week-day">
              <span className="today-week-letter">{day.day?.slice(0, 1) || '-'}</span>
              <div className={`today-week-circle ${day.status === 'today' ? 'is-today' : ''} ${day.status === 'completed' ? 'is-complete' : ''}`}>
                {day.status === 'completed'
                  ? '✓'
                  : day.status === 'today'
                    ? 'R'
                    : day.status === 'missed'
                      ? '!'
                      : '–'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="task-card today-minimum-card">
      <div>
        <strong>Minimum movement</strong>
        <p>Not full capacity today? This still counts.</p>
      </div>
      <span aria-hidden="true">›</span>
    </section>
  </div>
);
}

function TrackingStrip({ selectedDate, setSelectedDate, dayActivity = {} }) {
  const weekStart = useMemo(() => alignDateToAnchor(selectedDate, 'Monday'), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const key = toDateKey(day);
      return {
        key,
        dow: day.toLocaleDateString('en-US', { weekday: 'narrow' }),
        date: day.getDate(),
        isToday: sameDay(day, new Date()),
      };
    }),
    [weekStart],
  );

  return (
    <div className="tracking-strip">
      <div className="tracking-strip-nav">
        <button
          type="button"
          className="tracking-strip-arrow"
          aria-label="Previous week"
          onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, -7)))}
        >
          ‹
        </button>
        <span className="tracking-strip-range" aria-hidden="true">
          {formatShortMonthDay(weekDays[0]?.key)} – {formatShortMonthDay(weekDays[6]?.key)}
        </span>
        <button
          type="button"
          className="tracking-strip-arrow"
          aria-label="Next week"
          onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, 7)))}
        >
          ›
        </button>
      </div>
      <div className="tracking-strip-days" role="listbox" aria-label="Select a day">
        {weekDays.map(day => {
          const isActive = selectedDate === day.key;
          const count = dayActivity[day.key] || 0;
          return (
            <button
              key={day.key}
              type="button"
              role="option"
              aria-selected={isActive}
              aria-current={day.isToday ? 'date' : undefined}
              aria-label={new Date(`${day.key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              className={`tracking-strip-chip ${isActive ? 'is-active' : ''} ${day.isToday ? 'is-today' : ''}`}
              onClick={() => setSelectedDate(day.key)}
            >
              <span className="tracking-strip-dow">{day.dow}</span>
              <strong>{day.date}</strong>
              {count > 0 && (
                isActive
                  ? <span className="tracking-strip-count" aria-hidden="true">{count}</span>
                  : <span className="tracking-strip-dot" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CalendarScreen({ onOpenSettings }) {
  const { tasks, meals, workouts, calendarItems, setCalendarItems } = useTaskContext();
  const { fitnessSettings, selectedDate, setSelectedDate } = useAppContext();
  const [editingItemId, setEditingItemId] = useState(null);
  const [draftType, setDraftType] = useState('busy');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('10:00');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftPriority, setDraftPriority] = useState(false);
  const [patternName, setPatternName] = useState('Weekly pattern');
  const [sheetOpen, setSheetOpen] = useState(false);
  const { calendarPatterns, setCalendarPatterns, workCalendarPrefs } = useAppContext();

  const planState = useMemo(
    () => getPlanState({
      startDate: fitnessSettings.programStartDate,
      trainingDays: fitnessSettings.trainingDays,
      programType: fitnessSettings.programType,
    }),
    [fitnessSettings.programStartDate, fitnessSettings.programType, fitnessSettings.trainingDays],
  );

  const weekStart = useMemo(() => alignDateToAnchor(selectedDate, 'Monday'), [selectedDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);
      const key = toDateKey(day);
      return {
        key,
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        dateLabel: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: sameDay(day, new Date()),
      };
    }),
    [weekStart],
  );

  useEffect(() => {
    if (!weekDays.some(day => day.key === selectedDate)) {
      setSelectedDate(toDateKey(new Date()));
    }
  }, [selectedDate, weekDays]);

  const selectedDayItems = useMemo(() => {
    const scheduleItems = planState.sessions
      .filter(session => toDateKey(session.date) === selectedDate)
      .map(session => ({
        id: `plan-${session.dateKey}-${session.title}`,
        type: 'plan',
        title: session.label || session.title,
        subtitle: `${planState.programLabel} · ${session.detail || session.title}`,
      }));

    const calendarDayItems = calendarItems
      .filter(item => item.date === selectedDate)
      .map(item => ({
        id: item.id,
        type: item.type,
        title: item.title || 'Untitled item',
        startTime: item.startTime,
        endTime: item.endTime,
        subtitle: [
          formatAgendaTimeRange(item.startTime, item.endTime),
          item.priority ? 'Priority' : null,
          item.notes || null,
        ].filter(Boolean).join(' · '),
        notes: item.notes,
      }));

    const mealItems = meals
      .filter(meal => toDateKey(meal.loggedAt) === selectedDate)
      .map(meal => {
        let startTime;
        let endTime;
        if (meal.loggedAt) {
          const d = new Date(meal.loggedAt);
          const h = String(d.getHours()).padStart(2, '0');
          const m = String(d.getMinutes()).padStart(2, '0');
          startTime = `${h}:${m}`;
          const end = new Date(d.getTime() + 30 * 60 * 1000);
          endTime = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
        }
        return {
          id: `meal-${meal.id}`,
          type: 'meal',
          title: meal.name || 'Logged meal',
          subtitle: Array.isArray(meal.tags) && meal.tags.length ? meal.tags.filter(t => !t.startsWith('slot:')).join(' · ') : 'Logged meal',
          startTime,
          endTime,
        };
      });

    const workoutItems = workouts
      .filter(workout => workout.scheduledDate === selectedDate || toDateKey(workout.createdAt) === selectedDate)
      .map(workout => ({
        id: `workout-${workout.id}`,
        type: 'workout',
        title: workout.name || 'Workout',
        subtitle: `${workout.status} · ${workout.duration || 30} min`,
      }));

    const all = [...calendarDayItems, ...scheduleItems, ...mealItems, ...workoutItems];
    return all.sort((a, b) => {
      const aTime = a.startTime ?? null;
      const bTime = b.startTime ?? null;
      if (aTime && bTime) return aTime.localeCompare(bTime);
      if (aTime) return -1;
      if (bTime) return 1;
      return 0;
    });
  }, [calendarItems, meals, planState.sessions, selectedDate, workouts]);

  const selectedCalendarItem = useMemo(
    () => calendarItems.find(item => item.id === editingItemId) ?? null,
    [calendarItems, editingItemId],
  );

  const timedItems = useMemo(
    () => selectedDayItems.filter(
      item => Boolean(item.startTime) && getTimelineBlockStyle(item.startTime, item.endTime) !== null,
    ),
    [selectedDayItems],
  );

  const untimedItems = useMemo(
    () => selectedDayItems.filter(
      item => !item.startTime || getTimelineBlockStyle(item.startTime, item.endTime) === null,
    ),
    [selectedDayItems],
  );

  const isSelectedToday = selectedDate === toDateKey(new Date());

  const nowTopPx = useMemo(() => {
    if (!isSelectedToday) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const offsetMin = nowMin - TIMELINE_START_HOUR * 60;
    const maxMin = (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * 60;
    if (offsetMin < 0 || offsetMin > maxMin) return null;
    return Math.round(offsetMin * HOUR_HEIGHT_PX / 60);
  }, [isSelectedToday]);

  const exactSelectedDate = useMemo(() => formatFullDate(selectedDate), [selectedDate]);
  const selectedDayLabel = useMemo(
    () => isSelectedToday
      ? 'Today'
      : new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }),
    [isSelectedToday, selectedDate],
  );
  const weekDayActivity = useMemo(() => {
    const map = {};
    weekDays.forEach(({ key }) => {
      const planCount = planState.sessions.filter(s => toDateKey(s.date) === key).length;
      const calCount = calendarItems.filter(item => item.date === key).length;
      const mealCount = meals.filter(meal => toDateKey(meal.loggedAt) === key).length;
      const workoutCount = workouts.filter(w => w.scheduledDate === key || toDateKey(w.createdAt) === key).length;
      map[key] = planCount + calCount + mealCount + workoutCount;
    });
    return map;
  }, [weekDays, planState.sessions, calendarItems, meals, workouts]);

  const syncCardState = useMemo(
    () => getCalendarSyncCardState(workCalendarPrefs, calendarItems),
    [calendarItems, workCalendarPrefs],
  );

  useEffect(() => {
    if (selectedCalendarItem) {
      setDraftType(selectedCalendarItem.type);
      setDraftTitle(selectedCalendarItem.title);
      setDraftStartTime(selectedCalendarItem.startTime);
      setDraftEndTime(selectedCalendarItem.endTime);
      setDraftNotes(selectedCalendarItem.notes || '');
      setDraftPriority(Boolean(selectedCalendarItem.priority));
    }
  }, [selectedCalendarItem]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKeyDown(event) {
      if (event.key === 'Escape') resetDraft();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sheetOpen]);

  function resetDraft() {
    setEditingItemId(null);
    setDraftType('busy');
    setDraftTitle('');
    setDraftStartTime('09:00');
    setDraftEndTime('10:00');
    setDraftNotes('');
    setDraftPriority(false);
    setSheetOpen(false);
  }

  function openAddSheet() {
    setEditingItemId(null);
    setDraftType('busy');
    setDraftTitle('');
    setDraftStartTime('09:00');
    setDraftEndTime('10:00');
    setDraftNotes('');
    setDraftPriority(false);
    setSheetOpen(true);
  }

  function openAddSheetAtTime(startMinutes) {
    const snapped = Math.round(startMinutes / 15) * 15;
    const clampedStart = Math.max(TIMELINE_START_HOUR * 60, Math.min(snapped, TIMELINE_END_HOUR * 60 - 60));
    const endMin = clampedStart + 60;
    const pad = n => String(n).padStart(2, '0');
    setEditingItemId(null);
    setDraftType('busy');
    setDraftTitle('');
    setDraftStartTime(`${pad(Math.floor(clampedStart / 60))}:${pad(clampedStart % 60)}`);
    setDraftEndTime(`${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`);
    setDraftNotes('');
    setDraftPriority(false);
    setSheetOpen(true);
  }

  function handleLaneClick(event) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const clickedMin = Math.round(y / HOUR_HEIGHT_PX * 60) + TIMELINE_START_HOUR * 60;
    openAddSheetAtTime(clickedMin);
  }

  function saveCalendarItem() {
    const title = draftTitle.trim();
    if (!title) return;

    if (editingItemId) {
      setCalendarItems(current => current.map(item => (
        item.id === editingItemId
          ? { ...item, type: draftType, title, startTime: draftStartTime, endTime: draftEndTime, notes: draftNotes, priority: draftPriority }
          : item
      )));
    } else {
      setCalendarItems(current => [
        {
          id: `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: draftType,
          title,
          date: selectedDate,
          startTime: draftStartTime,
          endTime: draftEndTime,
          notes: draftNotes,
          repeatWeekly: false,
          priority: draftPriority,
        },
        ...current,
      ]);
    }

    resetDraft();
  }

  function deleteCalendarItem(itemId) {
    setCalendarItems(current => current.filter(item => item.id !== itemId));
    if (editingItemId === itemId) resetDraft();
  }

  function savePattern() {
    const itemsForPattern = calendarItems
      .filter(item => item.date === selectedDate)
      .map(item => ({
        ...item,
        id: undefined,
      }));

    if (itemsForPattern.length === 0) return;

    const pattern = {
      id: `pattern-${Date.now()}`,
      name: patternName.trim() || `Pattern ${calendarPatterns.length + 1}`,
      sourceDate: selectedDate,
      items: itemsForPattern,
    };

    setCalendarPatterns(current => [pattern, ...current]);
  }

  function applyPattern(pattern) {
    const targetDate = addDays(new Date(`${pattern.sourceDate}T00:00:00`), 7);
    const targetKey = toDateKey(targetDate);
    const cloned = pattern.items.map(item => ({
      ...item,
      id: `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: targetKey,
    }));
    setCalendarItems(current => [...cloned, ...current]);
    setSelectedDate(targetKey);
  }

  return (
  <div className="tab-stack calendar-dashboard">

    {/* Selected-date header */}
    <section className="cal-header">
      <h1 className="cal-header-date">{selectedDayLabel}</h1>
    </section>

    {/* Week strip */}
    <TrackingStrip selectedDate={selectedDate} setSelectedDate={setSelectedDate} dayActivity={weekDayActivity} />

    <span className="sr-only" aria-live="polite" aria-atomic="true">
      {formatFullDate(selectedDate)} selected
    </span>

    {/* Primary timeline card – main feature of the page */}
    <Card variant="flat" className="home-card home-section cal-agenda-card cal-timeline-card">
      {/* Scrollable timeline body */}
      <div className="cal-timeline-scroll">
        <div className="cal-timeline-grid" style={{ height: `${TIMELINE_TOTAL_HEIGHT}px` }}>

          {/* Hour labels column */}
          <div className="cal-timeline-labels" aria-hidden="true">
            {TIMELINE_HOURS.map(hour => (
              <div
                key={hour}
                className="cal-timeline-hour-label"
                style={{ top: `${(hour - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX}px` }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {/* Schedule lane */}
          <div
            className="cal-timeline-lane"
            onClick={handleLaneClick}
            aria-label="Day schedule. Tap empty space to add an item."
          >
            {/* Hour grid lines */}
            {TIMELINE_HOURS.map(hour => (
              <div
                key={hour}
                className="cal-hour-line"
                style={{ top: `${(hour - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX}px` }}
                aria-hidden="true"
              />
            ))}

            {/* Half-hour tick lines */}
            {TIMELINE_HOURS.slice(0, -1).map(hour => (
              <div
                key={`${hour}-half`}
                className="cal-hour-line cal-hour-line--half"
                style={{ top: `${(hour - TIMELINE_START_HOUR) * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2}px` }}
                aria-hidden="true"
              />
            ))}

            {/* Timed blocks */}
            {timedItems.map(item => {
              const pos = getTimelineBlockStyle(item.startTime, item.endTime);
              if (!pos) return null;
              const isEditable = ['busy', 'event', 'task'].includes(item.type);
              return (
                <div
                  key={item.id}
                  className={`cal-timeline-block cal-timeline-block--${item.type}`}
                  style={{ top: `${pos.top}px`, height: `${pos.height}px` }}
                  onClick={event => {
                    event.stopPropagation();
                    if (isEditable) { setEditingItemId(item.id); setSheetOpen(true); }
                  }}
                  role={isEditable ? 'button' : undefined}
                  tabIndex={isEditable ? 0 : undefined}
                  onKeyDown={isEditable ? event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setEditingItemId(item.id);
                      setSheetOpen(true);
                    }
                  } : undefined}
                  aria-label={`${item.title}${item.startTime ? `, ${formatAgendaTimeRange(item.startTime, item.endTime)}` : ''}`}
                >
                  <div className="cal-timeline-block__title">{item.title}</div>
                  {pos.height >= 36 && item.startTime && (
                    <div className="cal-timeline-block__time">
                      {formatAgendaTimeRange(item.startTime, item.endTime)}
                    </div>
                  )}
                  {pos.height >= 52 && item.subtitle && !item.startTime && (
                    <div className="cal-timeline-block__time">{item.subtitle}</div>
                  )}
                </div>
              );
            })}

            {/* Now indicator – only on today */}
            {nowTopPx !== null && (
              <div className="cal-now-indicator" style={{ top: `${nowTopPx}px` }} aria-hidden="true">
                <div className="cal-now-dot" />
                <div className="cal-now-line" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unscheduled items – items with no usable time data */}
      {untimedItems.length > 0 && (
        <div className="cal-unscheduled-section">
          <p className="cal-unscheduled-title">Unscheduled ({untimedItems.length})</p>
          <div className="home-list">
            {untimedItems.map(item => (
              <ListRow
                key={item.id}
                variant="card"
                className="cal-agenda-row"
                label={item.title}
                sub={item.subtitle || item.type}
                trailing={
                  <div className="cal-row-trailing">
                    <span className={`status-pill ${getItemStatusTone(item.type)}`}>
                      {getCalendarItemTypeLabel(item.type)}
                    </span>
                    {['busy', 'event', 'task'].includes(item.type) && (
                      <button
                        type="button"
                        aria-label={`Edit ${item.title}`}
                        className="ghost-button compact-ghost"
                        onClick={() => { setEditingItemId(item.id); setSheetOpen(true); }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty hint when truly nothing scheduled */}
      {selectedDayItems.length === 0 && (
        <p className="cal-timeline-empty-hint">
          Tap + to add a busy block, event, or task — or tap any hour in the timeline above.
        </p>
      )}
    </Card>

    {/* Google sync – secondary callout */}
    <div className="cal-sync-callout">
      <div className="cal-sync-row">
        <div className="cal-sync-status">
          <span className={`cal-sync-dot ${syncCardState.dotClassName}`} aria-hidden="true" />
          <span className="cal-sync-title">{syncCardState.title}</span>
        </div>
        <div className="cal-sync-actions">
          <span className={`status-pill ${syncCardState.toneClassName}`}>{syncCardState.statusPill}</span>
          <button type="button" className="ghost-button compact-ghost" onClick={onOpenSettings}>
            {syncCardState.ctaLabel}
          </button>
        </div>
      </div>
    </div>

    {/* Pattern – single tappable row */}
    <Card variant="flat" className="home-card home-section cal-pattern-card cal-utility-card">
      <ExpandablePanel
        header={<span className="cal-pattern-row-label">Save this week as a pattern</span>}
        className="calendar-pattern-expandable"
      >
        <div className="calendar-pattern-row" style={{ marginTop: '10px' }}>
          <input
            aria-label="Pattern name"
            className="task-title-input calendar-pattern-input"
            value={patternName}
            onChange={event => setPatternName(event.target.value)}
            placeholder="Pattern name (e.g. Typical Mon)"
          />
          <button type="button" className="calendar-primary-button calendar-save-button" onClick={savePattern}>
            Save
          </button>
        </div>

        {calendarPatterns.length > 0 && (
          <div className="subtle-feed cal-pattern-list">
            {calendarPatterns.map(pattern => (
              <ListRow
                key={pattern.id}
                variant="card"
                label={pattern.name}
                sub={`${pattern.items.length} items · ${formatFullDate(pattern.sourceDate)}`}
                trailing={(
                  <button type="button" className="ghost-button compact-ghost" onClick={() => applyPattern(pattern)}>
                    Apply next week
                  </button>
                )}
              />
            ))}
          </div>
        )}
      </ExpandablePanel>
    </Card>

    {sheetOpen && createPortal(
      <div
        className="modal-backdrop calendar-sheet-backdrop"
        onClick={resetDraft}
      >
        <div
          className="modal-card calendar-sheet-card"
          onClick={event => event.stopPropagation()}
        >
          <div className="modal-header">
            <h2 style={{ margin: 0 }}>{editingItemId ? `Edit ${exactSelectedDate}` : `Add item for ${exactSelectedDate}`}</h2>
            <button type="button" className="ghost-button compact-ghost" onClick={resetDraft}>✕</button>
          </div>

          <div className="segmented-control">
            {['busy', 'event', 'task'].map(type => (
              <button
                key={type}
                type="button"
                className={`status-chip ${draftType === type ? 'is-active' : ''}`}
                onClick={() => setDraftType(type)}
              >
                {type}
              </button>
            ))}
          </div>

          <input
            className="task-title-input"
            value={draftTitle}
            onChange={event => setDraftTitle(event.target.value)}
            placeholder="Title"
            autoFocus
          />

          <div className="calendar-time-row">
            <input
              className="task-title-input"
              type="time"
              value={draftStartTime}
              onChange={event => setDraftStartTime(event.target.value)}
            />
            <input
              className="task-title-input"
              type="time"
              value={draftEndTime}
              onChange={event => setDraftEndTime(event.target.value)}
            />
          </div>

          <ExpandablePanel header="More details">
            <div className="field-stack">
              <textarea
                className="task-title-input"
                rows={3}
                value={draftNotes}
                onChange={event => setDraftNotes(event.target.value)}
                placeholder="Notes"
              />
              <label
                className="field-stack compact-field"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span>Priority</span>
                <input
                  type="checkbox"
                  checked={draftPriority}
                  onChange={event => setDraftPriority(event.target.checked)}
                />
              </label>
            </div>
          </ExpandablePanel>

          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={saveCalendarItem}>
              {editingItemId ? 'Save changes' : 'Add item'}
            </button>
            {editingItemId && (
              <button
                type="button"
                className="ghost-button compact-ghost"
                onClick={() => deleteCalendarItem(editingItemId)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    )}
  </div>
);
}

function NutritionScreen({ now }) {
  const { meals, setMeals, createMeal, setNotifications, createNotification, pantryItems, setPantryItems } = useTaskContext();
  const { mealPrefs, selectedDate: selectedPlanDay, setSelectedDate: setSelectedPlanDay } = useAppContext();
  const [mealName, setMealName] = useState('');
  const [mealTags, setMealTags] = useState([]);
  const [mealSlot, setMealSlot] = useState('auto');
  const [planDrafts, setPlanDrafts] = useState(() => Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, ''])));
  const [pantryDraft, setPantryDraft] = useState('');
  const [prepNote, setPrepNote] = useState('');
  const todayKey = toDateKey(now);

  const selectedDayMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === selectedPlanDay),
    [meals, selectedPlanDay],
  );

  const selectedDayFuelMeals = useMemo(
    () => selectedDayMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('water')),
    [selectedDayMeals],
  );

  const hydrationCount = useMemo(
    () => selectedDayMeals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('water')).length,
    [selectedDayMeals],
  );

  const mealSlots = useMemo(() => NUTRITION_SLOTS.map(slot => {
    const slotMeals = selectedDayFuelMeals.filter(meal => {
      const slotTag = meal.tags?.find(tag => typeof tag === 'string' && tag.startsWith('slot:'))?.slice(5);
      return slotTag === slot.id || `${meal.name} ${meal.tags.join(' ')}`.toLowerCase().includes(slot.keywords[0]);
    });
    return {
      ...slot,
      planned: slotMeals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('planned')),
      logged: slotMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('planned')),
    };
  }), [selectedDayFuelMeals]);

  const slotCoverage = useMemo(
    () => mealSlots.reduce((accumulator, slot) => {
      accumulator.planned += slot.planned.length;
      accumulator.logged += slot.logged.length;
      return accumulator;
    }, { planned: 0, logged: 0 }),
    [mealSlots],
  );

  const macroSummary = useMemo(() => {
    const counts = { protein: 0, carbs: 0, veg: 0, quick: 0 };
    selectedDayFuelMeals.forEach(meal => {
      counts.protein += Array.isArray(meal.tags) && meal.tags.includes('protein') ? 1 : 0;
      counts.carbs += Array.isArray(meal.tags) && meal.tags.includes('carbs') ? 1 : 0;
      counts.veg += Array.isArray(meal.tags) && meal.tags.includes('veg') ? 1 : 0;
      counts.quick += Array.isArray(meal.tags) && meal.tags.includes('quick') ? 1 : 0;
    });
    return counts;
  }, [selectedDayFuelMeals]);

  const planWeekDays = useMemo(() => {
    const weekStart = alignDateToAnchor(now, 'Monday');
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(weekStart, index);
      return {
        key: toDateKey(day),
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: day.getDate(),
      };
    });
  }, [now]);

  const planDayMeals = useMemo(
    () => meals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('planned') && toDateKey(meal.loggedAt) === selectedPlanDay),
    [meals, selectedPlanDay],
  );

  useEffect(() => {
    setPlanDrafts(() => {
      const next = Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, '']));
      NUTRITION_SLOTS.forEach(slot => {
        const plannedMeal = planDayMeals.find(meal => {
          const slotTag = meal.tags?.find(tag => typeof tag === 'string' && tag.startsWith('slot:'))?.slice(5);
          return slotTag === slot.id;
        });
        if (plannedMeal) next[slot.id] = plannedMeal.name;
      });
      return next;
    });
  }, [planDayMeals, selectedPlanDay]);

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function resolveMealSlotName(name, tags, loggedAt = Date.now()) {
    const haystack = `${name} ${tags.join(' ')}`.toLowerCase();
    const matchedSlot = NUTRITION_SLOTS.find(slot => slot.keywords.some(keyword => haystack.includes(keyword)));
    if (matchedSlot) return matchedSlot.id;
    const hour = new Date(loggedAt).getHours();
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 21) return 'dinner';
    return 'snacks';
  }

  function submitMeal(slotOverride = mealSlot) {
    const trimmed = mealName.trim();
    if (!trimmed) return;
    const resolvedSlot = slotOverride === 'auto' ? resolveMealSlotName(trimmed, mealTags) : slotOverride;
    const tags = Array.from(new Set([...mealTags, `slot:${resolvedSlot}`]));
    setMeals(current => [createMeal({ name: trimmed, tags }), ...current]);
    setMealName('');
    setMealTags([]);
    setMealSlot('auto');
    upsertNotification('Meal logged', `${trimmed} · ${resolvedSlot}`);
  }

  function logWater(amount = 1) {
    setMeals(current => [
      ...Array.from({ length: amount }, () => createMeal({ name: 'Water', tags: ['water'] })),
      ...current,
    ]);
    upsertNotification('Hydration updated', `${amount} cup${amount > 1 ? 's' : ''} added`);
  }

  function savePlan() {
    const planDayTimestamp = startOfDay(new Date(selectedPlanDay)).getTime();
    const plannedMeals = NUTRITION_SLOTS.flatMap(slot => {
      const trimmed = planDrafts[slot.id]?.trim();
      if (!trimmed) return [];
      return [
        createMeal({
          name: trimmed,
          tags: ['planned', `slot:${slot.id}`],
          loggedAt: planDayTimestamp,
        }),
      ];
    });

    setMeals(current => {
      const withoutOldPlan = current.filter(meal => {
        if (toDateKey(meal.loggedAt) !== selectedPlanDay) return true;
        if (!Array.isArray(meal.tags) || !meal.tags.includes('planned')) return true;
        return !NUTRITION_SLOTS.some(slot => (meal.tags || []).includes(`slot:${slot.id}`));
      });
      return [...plannedMeals, ...withoutOldPlan];
    });

    upsertNotification('Meal plan saved', selectedPlanDay === todayKey ? 'Today plan updated' : `Plan updated for ${selectedPlanDay}`);
  }

  function savePantryItem() {
    const trimmed = pantryDraft.trim();
    if (!trimmed) return;
    setPantryItems(current => [trimmed, ...current]);
    setPantryDraft('');
  }

  function removePantryItem(item) {
    setPantryItems(current => current.filter(entry => entry !== item));
  }

  function addPrepNote() {
    const trimmed = prepNote.trim();
    if (!trimmed) return;
    upsertNotification('Prep note saved', trimmed.slice(0, 42));
    setPrepNote('');
  }

  const isSelectedToday = selectedPlanDay === todayKey;

  const nutritionWeekActivity = useMemo(() => {
    const map = {};
    planWeekDays.forEach(({ key }) => {
      map[key] = meals.filter(meal => toDateKey(meal.loggedAt) === key).length;
    });
    return map;
  }, [planWeekDays, meals]);

  return (
    <div className="tab-stack nutrition-stack">
      <TrackingStrip selectedDate={selectedPlanDay} setSelectedDate={setSelectedPlanDay} dayActivity={nutritionWeekActivity} />
      <Card>
        <SectionHeader
          eyebrow="Nutrition"
          title={isSelectedToday ? "Today's fuel" : formatDateLabel(selectedPlanDay)}
        />
        <div className="ui-metrics-row">
          <MetricBlock value={slotCoverage.planned} label="Planned" />
          <MetricBlock value={slotCoverage.logged} label="Logged" />
          <MetricBlock value={hydrationCount} label="Water" />
        </div>

        <div className="quick-entry-row">
          <input className="task-title-input" value={mealName} onChange={event => setMealName(event.target.value)} placeholder="Meal or snack" />
          <button type="button" className="primary-button" onClick={() => submitMeal()}>
            Log
          </button>
        </div>

        <div className="tag-row">
          <button type="button" className={`status-chip ${mealSlot === 'auto' ? 'is-active' : ''}`} onClick={() => setMealSlot('auto')}>
            Auto
          </button>
          {NUTRITION_SLOTS.map(slot => (
            <button
              key={slot.id}
              type="button"
              className={`status-chip ${mealSlot === slot.id ? 'is-active' : ''}`}
              onClick={() => {
                setMealSlot(slot.id);
                if (mealName.trim()) submitMeal(slot.id);
              }}
            >
              {slot.label}
            </button>
          ))}
        </div>

        <div className="tag-row">
          {QUICK_MEAL_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              className={`status-chip ${mealTags.includes(tag) ? 'is-active' : ''}`}
              onClick={() => setMealTags(current => (current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]))}
            >
              {tag}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Today's meals" title="Planned vs logged by slot" />
        <div className="nutrition-slot-grid">
          {mealSlots.map(slot => (
            <article key={slot.id} className="nutrition-slot-card">
              <div className="nutrition-slot-head">
                <div>
                  <strong>{slot.label}</strong>
                  <p>{slot.keywords[0] || slot.label.toLowerCase()}</p>
                </div>
                <button
                  type="button"
                  className="ghost-button compact-ghost"
                  onClick={() => {
                    setMealSlot(slot.id);
                    setMealName(slot.planned[0]?.name || '');
                  }}
                >
                  Log here
                </button>
              </div>

              <div className="nutrition-slot-lines">
                <p className="nutrition-slot-line">
                  <span className="status-pill status-planned">Planned</span>{' '}
                  {slot.planned.length ? slot.planned.map(meal => meal.name).join(' · ') : 'No plan yet'}
                </p>
                <p className="nutrition-slot-line">
                  <span className="status-pill status-active">Logged</span>{' '}
                  {slot.logged.length
                    ? slot.logged.map(meal => `${meal.name} · ${formatShortTime(meal.loggedAt)}`).join(' · ')
                    : 'Nothing logged'}
                </p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Hydration" title="Keep water visible" action={<strong>{hydrationCount} cups</strong>} />
        <div className="nutrition-meter">
          <div className="progress-bar">
            <span style={{ width: `${Math.min(100, Math.round((hydrationCount / mealPrefs.hydrationGoal) * 100))}%` }} />
          </div>
          <p className="empty-message">Simple tap tracking. Goal: {mealPrefs.hydrationGoal} cups.</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={() => logWater(1)}>
            +1 cup
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={() => logWater(2)}>
            +2 cups
          </button>
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Meal planning"
          title={selectedPlanDay === todayKey ? 'Today' : formatDateLabel(selectedPlanDay)}
          action={<button type="button" className="primary-button" onClick={savePlan}>Save plan</button>}
        />
        <div className="week-strip calendar-week-strip" role="group" aria-label="Select plan day">
          {planWeekDays.map(day => (
            <button
              key={day.key}
              type="button"
              className={`week-strip-item ${day.key === selectedPlanDay ? 'is-active' : ''} ${day.key === todayKey ? 'is-today' : ''}`}
              onClick={() => setSelectedPlanDay(day.key)}
            >
              <strong>{day.label}</strong>
              <p>{day.dayNum}</p>
            </button>
          ))}
        </div>
        <div className="nutrition-plan-grid">
          {NUTRITION_SLOTS.map(slot => (
            <label key={slot.id} className="field-stack">
              <span>{slot.label}</span>
              <input
                className="task-title-input"
                value={planDrafts[slot.id]}
                onChange={event => setPlanDrafts(current => ({ ...current, [slot.id]: event.target.value }))}
                placeholder={`Plan ${slot.label.toLowerCase()}`}
              />
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Pantry" title="Lightweight visibility" />
        <div className="quick-entry-row">
          <input className="task-title-input" value={pantryDraft} onChange={event => setPantryDraft(event.target.value)} placeholder="Add pantry item" />
          <button type="button" className="ghost-button compact-ghost" onClick={savePantryItem}>
            Add
          </button>
        </div>
        <div className="tag-row">
          {pantryItems.map(item => (
            <span key={item} className="status-pill pantry-item">
              {item}
              <button type="button" className="pantry-remove" aria-label={`Remove ${item}`} onClick={() => removePantryItem(item)}>
                ×
              </button>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Macros / prep" title="Keep it simple" />
        <div className="ui-metrics-row">
          <MetricBlock value={macroSummary.protein} label="Protein" />
          <MetricBlock value={macroSummary.carbs} label="Carbs" />
          <MetricBlock value={macroSummary.veg} label="Veg" />
        </div>
        <div className="subtle-feed">
          {SAVED_MEALS.slice(0, 4).map(meal => (
            <ListRow key={meal.meal} variant="card" label={meal.meal} sub={`${meal.cal} kcal · P ${meal.pro} · C ${meal.carb}`} />
          ))}
        </div>
        <label className="field-stack">
          <span>Prep note</span>
          <textarea className="notes-textarea" value={prepNote} onChange={event => setPrepNote(event.target.value)} placeholder="Prep work, grocery gaps, reminders" />
        </label>
        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={addPrepNote}>
            Save note
          </button>
        </div>
      </Card>
    </div>
  );
}

function FitnessScreen({ now, activeWorkoutId, onStartWorkout }) {
  const { workouts, setWorkouts, setNotifications, createNotification, createWorkout, createExercise } = useTaskContext();
  const { energyState, setEnergyState, fitnessSettings, selectedDate: selectedDateKey, setSelectedDate: setSelectedDateKey } = useAppContext();
  const { profile } = useProfileContext();
  const [activeSubTab, setActiveSubTab] = useState('training');
  const [checkInDraft, setCheckInDraft] = useState(() => ({
    mood: energyState.mood || 'steady',
    energy: Number.isFinite(energyState.value) ? energyState.value : 5,
    sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
  }));
  const [acceptedRecovery, setAcceptedRecovery] = useState(false);
  const [acknowledgedMisses, setAcknowledgedMisses] = useState(() => new Set());

  useEffect(() => {
    setCheckInDraft({
      mood: energyState.mood || 'steady',
      energy: Number.isFinite(energyState.value) ? energyState.value : 5,
      sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
    });
  }, [energyState.mood, energyState.value, energyState.sleepHours]);

  const activeWorkout = useMemo(
    () => workouts.find(workout => workout.id === activeWorkoutId) ?? null,
    [workouts, activeWorkoutId],
  );

  const todayKey = toDateKey(now);
  const normalizedProgramType = normalizeProgramType(fitnessSettings.programType);
  const athleteDefaults = profile?.athlete || {};
  const normalizedWorkoutHistory = useMemo(
    () => workouts.map(workout => ({ ...workout, plannedDate: workout.plannedDate || workout.scheduledDate || null })),
    [workouts],
  );
  const planState = useMemo(
    () => getPlanState({
      startDate: fitnessSettings.programStartDate,
      trainingDays: fitnessSettings.trainingDays,
      programType: fitnessSettings.programType,
      today: now,
      history: normalizedWorkoutHistory,
      athleteDefaults,
    }),
    [athleteDefaults, fitnessSettings.programStartDate, fitnessSettings.programType, fitnessSettings.trainingDays, normalizedWorkoutHistory, now],
  );
  const weeklySchedule = planState.sessions;
  const programWeek = planState.week;
  const programPhase = planState.phase.name;
  const activeProgramName = planState.programLabel || getProgramDisplayName(fitnessSettings.programType);
  const hasGeneratedSchedule = weeklySchedule.length > 0;
  const programEmptyState = getProgramEmptyState(fitnessSettings.programType);

  const progressSnapshot = useMemo(
    () => getFitnessProgressSnapshot({
      workouts,
      weeklySchedule,
      fitnessSettings,
      programType: fitnessSettings.programType,
      todayKey,
    }),
    [fitnessSettings, todayKey, weeklySchedule, workouts],
  );

  const librarySections = useMemo(
    () => getProgramLibrarySections(fitnessSettings.programType),
    [fitnessSettings.programType],
  );

  const recentCompletedWorkouts = useMemo(
    () => workouts
      .filter(workout => workout.status === 'completed' && getWorkoutProgramType(workout) === normalizedProgramType)
      .slice(0, 5),
    [normalizedProgramType, workouts],
  );

  const recoveryState = useMemo(
    () => computeRecoveryState({ energyScore: checkInDraft.energy, sleepHours: checkInDraft.sleepHours }, checkInDraft.energy, checkInDraft.sleepHours),
    [checkInDraft.energy, checkInDraft.sleepHours],
  );

  const recoveryRecommendation = useMemo(() => {
    const baseWorkout = weeklySchedule.find(session => session.dateKey === todayKey) ?? null;
    if (!baseWorkout) return null;
    return adjustWorkoutForRecovery({
      id: 'today-session',
      name: baseWorkout.label || baseWorkout.title,
      type: baseWorkout.type,
      ex: [],
    }, recoveryState);
  }, [recoveryState, todayKey, weeklySchedule]);

  const weekDays = useMemo(() => {
    const anchor = alignDateToAnchor(selectedDateKey, 'Monday');
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(anchor, i);
      const key = toDateKey(d);
      const session = weeklySchedule.find(s => s.dateKey === key) ?? null;
      const isToday = key === todayKey;
      const workoutRecord = getWorkoutRecordForDate(workouts, key);
      const stateMeta = getWorkoutStateMeta({
        session,
        dateKey: key,
        workouts,
        todayKey,
        now,
      });
      return {
        key,
        dayLabel: DAY_LABELS[i],
        session,
        isToday,
        workoutRecord,
        stateMeta,
        tileStatus: stateMeta.tileState,
        shortDateLabel: formatShortMonthDay(key),
      };
    });
  }, [selectedDateKey, todayKey, weeklySchedule, workouts, now]);

  useEffect(() => {
    setSelectedDateKey(current => (
      weekDays.some(day => day.key === current) ? current : todayKey
    ));
  }, [todayKey, weekDays]);

  const selectedDay = useMemo(
    () => weekDays.find(day => day.key === selectedDateKey) ?? weekDays.find(day => day.isToday) ?? weekDays[0] ?? null,
    [selectedDateKey, weekDays],
  );
  const selectedDateContext = useMemo(
    () => getContextualDateLabel(selectedDay?.key || todayKey),
    [selectedDay, todayKey],
  );
  const selectedWorkoutSource = useMemo(
    () => selectedDay?.workoutRecord || selectedDay?.session || null,
    [selectedDay],
  );
  const selectedWorkoutDetails = useMemo(
    () => (
      selectedWorkoutSource
        ? getStructuredWorkoutDetails(selectedWorkoutSource, activeProgramName)
        : null
    ),
    [activeProgramName, selectedWorkoutSource],
  );
  const selectedStateMeta = selectedDay?.stateMeta ?? {
    state: 'rest',
    label: 'Rest',
    className: 'status-planned',
    tileState: 'rest',
  };
  const selectedProgramWeek = selectedWorkoutDetails?.programWeek ?? selectedDay?.session?.programWeek ?? programWeek;
  const selectedTiming = selectedWorkoutDetails?.scheduleLabel || [
    selectedDay?.session?.plannedTime || null,
    Number.isFinite(selectedDay?.session?.duration) ? `${selectedDay.session.duration} min` : null,
  ].filter(Boolean).join(' · ');
  const selectedSummary = selectedDay?.session
    ? selectedDay.isToday
      ? 'Fitness owns the workout details and control. Calendar still owns the schedule.'
      : 'Selected from the weekly plan. Calendar keeps the scheduled time, and Fitness holds the workout detail.'
    : selectedDay?.isToday
      ? 'No workout is scheduled today. Calendar stays open, and Fitness is ready when the plan updates.'
      : 'No workout is scheduled for this date.';
  const canStartSelectedWorkout = Boolean(
    selectedDay?.isToday
      && selectedDay?.session
      && selectedStateMeta.state !== 'done',
  );

  const missedSessions = useMemo(
    () => weeklySchedule.filter(session => (
      session.dateKey < todayKey
      && !workouts.some(workout => (
        workout.scheduledDate === session.dateKey
        && ['completed', 'skipped'].includes(workout.status)
      ))
    )),
    [todayKey, weeklySchedule, workouts],
  );

  const unacknowledgedMisses = useMemo(
    () => missedSessions.filter(session => !acknowledgedMisses.has(`miss-${session.dateKey}`)),
    [acknowledgedMisses, missedSessions],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function updateWorkoutById(workoutId, updater) {
    setWorkouts(current => current.map((workout, index) => (
      workout.id === workoutId
        ? normalizeWorkoutRecord(updater(workout), index)
        : workout
    )));
  }

  function appendWorkout(workout) {
    setWorkouts(current => [normalizeWorkoutRecord(workout, current.length), ...current]);
  }

  function mergeWorkoutLog(workout, patch = {}) {
    const nextLog = normalizeWorkoutLog({
      ...(workout.workoutLog || {}),
      ...patch,
      startedAt: workout.startedAt || workout.workoutLog?.startedAt || Date.now(),
      segments: (() => {
        const currentSegments = Array.isArray(workout.workoutLog?.segments)
          ? workout.workoutLog.segments
          : [];

        if (Array.isArray(patch.segments)) {
          return patch.segments;
        }

        if (!patch.segment) {
          return currentSegments;
        }

        const remainingSegments = currentSegments.filter(entry => entry.id !== patch.segment.id);
        return [...remainingSegments, patch.segment];
      })(),
    }, {
      startedAt: workout.startedAt || workout.workoutLog?.startedAt || Date.now(),
    });

    return nextLog;
  }

  function startWorkout(workoutId) {
    onStartWorkout(workoutId);
    const startedAt = Date.now();
    setWorkouts(current => current.map((workout, index) => (
      workout.id === workoutId
        ? {
            ...normalizeWorkoutRecord({
              ...workout,
              status: 'active',
              startedAt,
              type: getCurrentWorkoutType(workout),
              programId: fitnessSettings.programType || 'hyrox',
              programType: fitnessSettings.programType || workout.programType || 'hyrox',
              programName: workout.programName || getProgramDisplayName(fitnessSettings.programType),
              workoutLog: normalizeWorkoutLog({
                ...(workout.workoutLog || {}),
                source: 'manual',
                startedAt,
                lastUpdatedAt: startedAt,
                notes: workout.workoutLog?.notes || '',
                currentSegmentId: workout.workoutLog?.currentSegmentId || null,
                currentSegmentIndex: Number.isFinite(workout.workoutLog?.currentSegmentIndex) ? workout.workoutLog.currentSegmentIndex : 0,
                segments: Array.isArray(workout.workoutLog?.segments) ? workout.workoutLog.segments : [],
                externalRefs: workout.workoutLog?.externalRefs || {},
              }, { startedAt }),
            }, index),
            status: 'active',
          }
        : workout.status === 'active'
          ? normalizeWorkoutRecord({ ...workout, status: 'planned' }, index)
          : workout
    )));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;
    updateWorkoutById(activeWorkoutId, workout => ({ ...workout, status: 'planned' }));
    onStartWorkout(null);
  }

  function completeWorkout(workoutLog) {
    if (!activeWorkoutId) return;
    const completedAt = Date.now();
    updateWorkoutById(activeWorkoutId, workout => ({
      ...workout,
      status: 'completed',
      completedAt,
      workoutLog: mergeWorkoutLog(workout, {
        ...(workoutLog || {}),
        completionLoggedAt: workoutLog?.completionLoggedAt || completedAt,
        completionSource: workoutLog?.completionSource || 'manual_completion',
        lastUpdatedAt: completedAt,
        notes: typeof workoutLog?.notes === 'string' ? workoutLog.notes : (workout.workoutLog?.notes || ''),
      }),
    }));
    upsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    onStartWorkout(null);
  }

  function logCompletion(workoutLog) {
    if (!activeWorkoutId) return;
    completeWorkout(workoutLog);
  }

  function updateWorkoutLog(patch) {
    if (!activeWorkoutId) return;
    updateWorkoutById(activeWorkoutId, workout => ({
      ...workout,
      workoutLog: mergeWorkoutLog(workout, patch),
    }));
  }

  function saveCheckIn() {
    setEnergyState(current => ({
      ...current,
      value: Number.isFinite(checkInDraft.energy) ? checkInDraft.energy : current.value ?? 3,
      sleepHours: Number.isFinite(checkInDraft.sleepHours) ? checkInDraft.sleepHours : current.sleepHours ?? 7,
      sleepSource: 'manual',
      mood: checkInDraft.mood,
      lastCheckIn: new Date().toISOString(),
    }));
    upsertNotification('Fitness check-in saved', `${checkInDraft.mood} · ${checkInDraft.energy}/10`);
    setAcceptedRecovery(false);
  }

  function skipCheckIn() {
    setEnergyState(current => ({ ...current, lastCheckIn: new Date().toISOString() }));
    setAcceptedRecovery(false);
  }

  function acceptRecoverySuggestion() {
    setAcceptedRecovery(true);
    upsertNotification('Recovery accepted', 'Today is now recovery-first.');
  }

  function startSelectedWorkout() {
    if (!selectedDay?.isToday || !selectedDay.session) return;
    const existingWorkout = getWorkoutRecordForDate(workouts, selectedDay.key);
    if (existingWorkout && existingWorkout.status !== 'completed' && existingWorkout.status !== 'skipped') {
      startWorkout(existingWorkout.id);
      return;
    }
    const sessionWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session: selectedDay.session,
      settings: fitnessSettings,
      todayKey: selectedDay.session.dateKey || todayKey,
    });
    appendWorkout(sessionWorkout);
    startWorkout(sessionWorkout.id);
  }

  function moveMissedSession(session) {
    const laterThisWeek = weeklySchedule.find(nextSession => nextSession.dateKey > session.dateKey);
    const nextDate = laterThisWeek?.dateKey ?? toDateKey(addDays(new Date(`${session.dateKey}T00:00:00`), 7));
    const movedWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session: { ...session, programWeek },
      settings: fitnessSettings,
      todayKey: nextDate,
      scheduledDateOverride: nextDate,
      plannedDateOverride: session.dateKey,
      statusOverride: 'planned',
    });
    appendWorkout(movedWorkout);
    setAcknowledgedMisses(prev => new Set([...prev, `miss-${session.dateKey}`]));
    upsertNotification('Session rescheduled', `${session.label || session.title} moved to ${nextDate}`);
  }

  function skipMissedSession(session) {
    const skippedWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session: { ...session, programWeek },
      settings: fitnessSettings,
      todayKey: session.dateKey,
      scheduledDateOverride: session.dateKey,
      plannedDateOverride: session.dateKey,
      statusOverride: 'skipped',
    });
    appendWorkout(skippedWorkout);
    setAcknowledgedMisses(prev => new Set([...prev, `miss-${session.dateKey}`]));
    upsertNotification('Session skipped', session.label || session.title);
  }

  return (
    <div className="tab-stack fitness-stack">
      <>
          <TrackingStrip
            selectedDate={selectedDateKey}
            setSelectedDate={setSelectedDateKey}
            dayActivity={Object.fromEntries(weekDays.map(d => [d.key, (d.session ? 1 : 0) + (d.workoutRecord ? 1 : 0)]))}
          />
          <Card variant="flat" className="home-card home-section fitness-hero-card">
            {!hasGeneratedSchedule ? (
              <EmptyState
                title={programEmptyState.title}
                description={programEmptyState.description}
              />
            ) : !selectedDay?.session ? (
              <>
                <div className="fitness-hero-header">
                  <div className="fitness-hero-lockup">
                    <p className="fitness-hero-eyebrow">Fitness</p>
                    <div className="fitness-hero-date">
                      <strong>{selectedDateContext.primary}</strong>
                      <span>{selectedDateContext.secondary}</span>
                    </div>
                  </div>
                  <span className={`status-pill ${selectedStateMeta.className}`}>{selectedStateMeta.label}</span>
                </div>
                <div className="fitness-hero-copy">
                  <h2 className="fitness-hero-headline">Rest and recovery</h2>
                  <p className="fitness-hero-meta">{selectedSummary}</p>
                </div>
              </>
            ) : (
              <>
                <div className="fitness-hero-header">
                  <div className="fitness-hero-lockup">
                    <p className="fitness-hero-eyebrow">Fitness</p>
                    <div className="fitness-hero-date">
                      <strong>{selectedDateContext.primary}</strong>
                      <span>{selectedDateContext.secondary}</span>
                    </div>
                  </div>
                  <span className={`status-pill ${selectedStateMeta.className}`}>{selectedStateMeta.label}</span>
                </div>
                <div className="fitness-hero-copy">
                  <p className="fitness-hero-kicker">{activeProgramName} · {programPhase}</p>
                  <h2 className="fitness-hero-headline">{selectedWorkoutDetails?.name || selectedDay.session.label || selectedDay.session.title}</h2>
                  <p className="fitness-hero-meta">{selectedSummary}</p>
                </div>
                <div className="fitness-workout-structure">
                  <div className="fitness-workout-meta-grid">
                    <div className="fitness-workout-meta-card">
                      <span>Workout type</span>
                      <strong>{selectedWorkoutDetails?.typeLabel || getProgramWorkoutTypeLabel(selectedDay.session)}</strong>
                    </div>
                    <div className="fitness-workout-meta-card">
                      <span>Program</span>
                      <strong>{selectedWorkoutDetails?.programName || activeProgramName}</strong>
                    </div>
                    <div className="fitness-workout-meta-card">
                      <span>Week</span>
                      <strong>{selectedProgramWeek ? `Week ${selectedProgramWeek}` : 'Current'}</strong>
                    </div>
                    <div className="fitness-workout-meta-card">
                      <span>State</span>
                      <strong>{selectedStateMeta.label}</strong>
                    </div>
                    <div className="fitness-workout-meta-card fitness-workout-meta-card--wide">
                      <span>Planned time</span>
                      <strong>{selectedTiming || 'Scheduled'}</strong>
                    </div>
                    {selectedWorkoutDetails?.contentSummary?.exerciseCount > 0 && (
                      <div className="fitness-workout-meta-card fitness-workout-meta-card--wide">
                        <span>Structure</span>
                        <strong>
                          {`${selectedWorkoutDetails.contentSummary.blockCount} block${selectedWorkoutDetails.contentSummary.blockCount === 1 ? '' : 's'} · ${selectedWorkoutDetails.contentSummary.exerciseCount} exercise${selectedWorkoutDetails.contentSummary.exerciseCount === 1 ? '' : 's'}`}
                        </strong>
                      </div>
                    )}
                  </div>
                  {selectedWorkoutDetails?.notes?.length > 0 && selectedWorkoutDetails.notes[0] !== selectedDay.session.detail && (
                    <p className="fitness-structured-note">{selectedWorkoutDetails.notes[0]}</p>
                  )}
                  {selectedWorkoutDetails?.blocks?.length > 0 && (
                    <div className="fitness-structured-blocks">
                      {selectedWorkoutDetails.blocks.map((block, index) => (
                        <article key={block.id || `${block.title}-${index}`} className="fitness-structured-block">
                          <div className="fitness-structured-block-header">
                            <strong>{block.title}</strong>
                            {getStructuredBlockSummary(block) && (
                              <span>{getStructuredBlockSummary(block)}</span>
                            )}
                          </div>
                          {block.notes[0] && (
                            <p className="fitness-structured-block-copy">{block.notes[0]}</p>
                          )}
                          <div className="fitness-structured-exercise-list">
                            {(block.exercises || []).map((exercise, exerciseIndex) => {
                              const exerciseMeta = formatStructuredExerciseMeta(exercise);
                              return (
                                <div key={exercise.id || `${block.id}-${exerciseIndex}`} className="fitness-structured-exercise">
                                  <span className="fitness-structured-exercise-name">{exercise.name}</span>
                                  {exerciseMeta && (
                                    <span className="fitness-structured-exercise-meta">{exerciseMeta}</span>
                                  )}
                                  {(exercise.note || exercise.cue) && (
                                    <span className="fitness-structured-exercise-note">
                                      {[exercise.note, exercise.cue].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                {selectedDay.session.detail && (
                  <p className="empty-message">{selectedDay.session.detail}</p>
                )}
                <div className="quick-entry-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={startSelectedWorkout}
                    disabled={!canStartSelectedWorkout}
                  >
                    {!selectedDay.isToday
                      ? 'Scheduled later this week'
                      : selectedStateMeta.state === 'done'
                        ? 'Workout done'
                        : selectedDay.workoutRecord?.status === 'active'
                          ? 'Resume Workout'
                          : selectedStateMeta.state === 'missed'
                            ? 'Start anyway'
                            : 'Start Workout'}
                  </button>
                </div>
              </>
            )}
          </Card>

          <Card variant="flat" className="home-card home-section fitness-week-card">
            <SectionHeader eyebrow="This Week" title={planState.label} />
            <p className="home-card-copy">Tap any day to load that workout into the detail section above.</p>
            <div className="fitness-week-grid" role="list" aria-label="Weekly workout plan">
              {weekDays.map(({ key, dayLabel, session, isToday, tileStatus }) => (
                <button
                  key={key}
                  type="button"
                  className={[
                    'fitness-week-tile',
                    isToday && 'fitness-week-tile--today',
                    tileStatus === 'completed' && 'fitness-week-tile--completed',
                    tileStatus === 'missed' && 'fitness-week-tile--missed',
                    tileStatus === 'rest' && 'fitness-week-tile--rest',
                    selectedDateKey === key && 'fitness-week-tile--selected',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedDateKey(key)}
                  aria-pressed={selectedDateKey === key}
                >
                  <p className="fitness-week-tile__day">{dayLabel}</p>
                  <p className="fitness-week-tile__name">
                    {session ? (session.label || session.title) : 'Rest'}
                  </p>
                  <div className="fitness-week-tile__dot" />
                </button>
              ))}
            </div>
            <div className="subtle-feed fitness-week-sessions">
              {weekDays.map(day => (
                <article
                  key={day.key}
                  className={`feed-card fitness-week-session-card${selectedDateKey === day.key ? ' is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="fitness-week-session-button"
                    onClick={() => setSelectedDateKey(day.key)}
                  >
                    <div className="fitness-week-session-row">
                      <div>
                        <strong>{day.dayLabel} · {day.session ? (day.session.label || day.session.title) : 'Rest / Recovery'}</strong>
                        <p>
                          {day.shortDateLabel}
                          {day.session
                            ? ` · ${getProgramWorkoutTypeLabel(day.session)} · ${day.session.duration} min${day.session.plannedTime ? ` · ${day.session.plannedTime}` : ''}`
                            : ' · No workout scheduled'}
                        </p>
                      </div>
                      <span className={`status-pill ${day.stateMeta.className}`}>{day.stateMeta.label}</span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
            {progressSnapshot.hasSchedule && (
              <div className="fitness-progress-grid">
                <article className="summary-tile fitness-progress-tile">
                  <span>Done</span>
                  <strong>{progressSnapshot.workoutsCompleted} / {progressSnapshot.workoutsTarget}</strong>
                </article>
                <article className="summary-tile fitness-progress-tile">
                  <span>Miles</span>
                  <strong>{progressSnapshot.milesCompleted} / {progressSnapshot.milesTarget}</strong>
                </article>
                {progressSnapshot.strengthSessions > 0 && (
                  <article className="summary-tile fitness-progress-tile">
                    <span>Strength</span>
                    <strong>{progressSnapshot.strengthSessions}</strong>
                  </article>
                )}
                {progressSnapshot.recoverySessions > 0 && (
                  <article className="summary-tile fitness-progress-tile">
                    <span>Recovery</span>
                    <strong>{progressSnapshot.recoverySessions}</strong>
                  </article>
                )}
              </div>
            )}
          </Card>

          <Card variant="flat" className="home-card home-section fitness-nav-card">
            <div className="segmented-control fitness-subnav" role="tablist" aria-label="Fitness sections">
              {FITNESS_SUBTABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSubTab === tab.id}
                  className={`status-chip ${activeSubTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveSubTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </Card>

          {activeSubTab === 'training' && (
            <>
              <Card variant="flat" className="home-card home-section fitness-support-card">
                <SectionHeader eyebrow="Daily check-in" title="Open the day with recovery context" />
                <div className="fitness-checkin-grid">
                  <label className="field-stack compact-field">
                    <span>Mood</span>
                    <div className="status-chip-group">
                      {['steady', 'charged', 'flat', 'tired'].map(mood => (
                        <button
                          key={mood}
                          type="button"
                          className={`status-chip ${checkInDraft.mood === mood ? 'is-active' : ''}`}
                          onClick={() => setCheckInDraft(current => ({ ...current, mood }))}
                        >
                          {mood}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="field-stack compact-field">
                    <span>Energy</span>
                    <div className="status-chip-group" role="group" aria-label="Energy rating">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(value => (
                        <button
                          key={value}
                          type="button"
                          className={`status-chip ${checkInDraft.energy === value ? 'is-active' : ''}`}
                          onClick={() => setCheckInDraft(current => ({ ...current, energy: value }))}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="field-stack compact-field">
                    <span>Sleep</span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      className="task-title-input"
                      value={checkInDraft.sleepHours}
                      onChange={event => setCheckInDraft(current => ({ ...current, sleepHours: Number.parseFloat(event.target.value) }))}
                    />
                  </label>
                </div>
                <div className="quick-entry-row">
                  <button type="button" className="secondary-button" onClick={saveCheckIn}>
                    Save check-in
                  </button>
                  <button type="button" className="ghost-button compact-ghost" onClick={skipCheckIn}>
                    Skip check-in
                  </button>
                </div>
                {recoveryState.level === 'Low' && !acceptedRecovery && (
                  <div className="feed-card">
                    <strong>Recovery recommendation</strong>
                    <p>
                      {recoveryRecommendation?.adjustmentLabel === 'Recovery Replacement'
                        ? 'Low energy or short sleep points toward a recovery replacement today.'
                        : 'Low energy or short sleep should move today toward recovery.'}
                    </p>
                    <div className="quick-entry-row">
                      <button type="button" className="secondary-button" onClick={acceptRecoverySuggestion}>
                        Accept recovery day
                      </button>
                      <button type="button" className="ghost-button compact-ghost" onClick={() => setAcceptedRecovery(true)}>
                        Keep current plan
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              {unacknowledgedMisses.length > 0 && (
                <Card variant="flat" className="home-card home-section fitness-support-card">
                  <SectionHeader eyebrow="Missed session" title={unacknowledgedMisses[0].label || unacknowledgedMisses[0].title} />
                  <article className="feed-card">
                    <strong>{unacknowledgedMisses[0].label || unacknowledgedMisses[0].title}</strong>
                    <p>Scheduled {unacknowledgedMisses[0].dateLabel} · {unacknowledgedMisses[0].detail || unacknowledgedMisses[0].title}</p>
                    <p className="empty-message">Move it to the next valid day, or skip it to keep the sequence clean.</p>
                    <div className="quick-entry-row">
                      <button type="button" className="secondary-button" onClick={() => moveMissedSession(unacknowledgedMisses[0])}>
                        Move to next training day
                      </button>
                      <button type="button" className="ghost-button compact-ghost" onClick={() => skipMissedSession(unacknowledgedMisses[0])}>
                        Skip
                      </button>
                    </div>
                  </article>
                </Card>
              )}
            </>
          )}

        {activeSubTab === 'nutrition' && (
          <NutritionScreen now={now} />
        )}
      </>
    </div>
  );
}

function MoreScreen({ initialSection = 'habits', onSwitchToTab, now }) {
  const { profile } = useProfileContext();
  const { workouts } = useTaskContext();
  const { hubInsights, setHubInsights } = useAppContext();
  const [activeSection, setActiveSection] = useState(initialSection);
  const [insightDraft, setInsightDraft] = useState('');
  const validSections = useMemo(() => new Set(MORE_SECTIONS.map(section => section.id)), []);

  useEffect(() => {
    setActiveSection(validSections.has(initialSection) ? initialSection : 'habits');
  }, [initialSection, validSections]);

  const weeklyAnalytics = useMemo(() => {
    const weekStart = toDateKey(alignDateToAnchor(now || new Date(), 'Monday'));
    const history = workouts.map(workout => ({
      type: getCurrentWorkoutType(workout),
      date: workout.scheduledDate || toDateKey(workout.createdAt),
      data: { plannedDate: workout.scheduledDate || null, calories: workout.calories || 0 },
    }));
    return computeWeeklyAnalytics(history, weekStart);
  }, [now, workouts]);

  function addInsightNote() {
    const trimmed = insightDraft.trim();
    if (!trimmed) return;
    setHubInsights(current => ({
      ...current,
      weeklyNotes: [{ id: `note-${Date.now()}`, text: trimmed }, ...(current.weeklyNotes || [])],
    }));
    setInsightDraft('');
  }

  function promoteInboxItem(itemId, module = 'note') {
    const item = inboxItems.find(entry => entry.id === itemId);
    if (!item) return;
    setInboxItems(current => current.filter(entry => entry.id !== itemId));
    if (module === 'note') {
      setProfile(current => ({
        ...current,
        dailyLogs: {
          ...current.dailyLogs,
          [toDateKey(new Date())]: [...(current.dailyLogs[toDateKey(new Date())] || []), item.text],
        },
      }));
    }
    if (module === 'task' && onSwitchToTab) onSwitchToTab('more');
  }

  const sectionDescriptions = {
    tasks: 'Task execution and triage.',
    meals: 'Fuel logging and planning.',
    finance: 'Accounts, subscriptions, and transactions.',
    lifestyle: 'Habits and recurring routines.',
    recovery: 'Energy, sleep, and recovery defaults.',
    maintenance: 'Home upkeep and recurring chores.',
    insights: 'Weekly review and notes.',
  };

  return (
    <div className="tab-stack">
      <Card>
        <SectionHeader eyebrow="More" title="Secondary workspaces" />
        <p className="empty-message">Today, Calendar, and Fitness stay in the primary nav. Recovery, Lifestyle, Maintenance, Insights, Finance, and Inbox live here.</p>
        <div className="tag-row">
          {MORE_SECTIONS.map(section => (
            <button
              key={section.id}
              type="button"
              className={`status-chip ${activeSection === section.id ? 'is-active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              {section.label}
            </button>
          ))}
        </div>
      </Card>

      {activeSection === 'habits' && (
        <Card>
          <SectionHeader eyebrow="Habits" title="Daily and weekly habits" />
          <div className="subtle-feed">
            {profile.habits && profile.habits.length > 0 ? profile.habits.map(habit => (
              <ListRow key={habit.id} variant="card" label={habit.title || 'Habit'} sub={habit.frequency} />
            )) : (
              <EmptyState title="No habits yet" description="Track repeated daily or weekly actions here." />
            )}
          </div>
        </Card>
      )}
      {activeSection === 'insights' && (
        <Card>
          <SectionHeader eyebrow="Insights" title="Weekly review" />
          <div className="subtle-feed">
            <div className="field-stack">
              <textarea
                className="notes-textarea"
                value={insightDraft}
                onChange={event => setInsightDraft(event.target.value)}
                placeholder="Capture a weekly insight"
              />
              <button type="button" className="secondary-button" onClick={() => {
                const trimmed = insightDraft.trim();
                if (!trimmed) return;
                setHubInsights(current => ({
                  ...current,
                  weeklyNotes: [{ id: `note-${Date.now()}`, text: trimmed }, ...(current.weeklyNotes || [])],
                }));
                setInsightDraft('');
              }}>
                Save insight
              </button>
            </div>
            {(hubInsights.weeklyNotes || []).length > 0 ? (hubInsights.weeklyNotes || []).map(note => (
              <ListRow key={note.id} variant="card" label={note.text} />
            )) : (
              <EmptyState title="No insights yet" description="Capture a weekly note before the week ends." />
            )}
          </div>
        </Card>
      )}
      {activeSection === 'finance' && <FinanceScreen />}
      {activeSection === 'maintenance' && (
        <Card>
          <SectionHeader eyebrow="Maintenance" title="Household and upkeep" />
          <HomeScreen />
        </Card>
      )}
    </div>
  );
}

function AppShell() {
  const {
    notifications,
    inboxItems,
    setInboxItems,
    workouts,
    setWorkouts,
    createWorkout,
    createExercise,
    setNotifications,
    createNotification,
    routines,
    setRoutines,
  } = useTaskContext();
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationPrefs,
    recoveryInputs,
    mealPrefs,
    fitnessSettings,
    activeBlock,
    setActiveBlock,
    focusSession,
    setFocusSessionDetails,
  } = useAppContext();
  const { profile } = useProfileContext();
  const [activeTab, setActiveTab] = useState('home');
  const [activeSurface, setActiveSurface] = useState(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Boot: on first render, initialize activeBlock from any persisted active workout.
  // Runs once; workouts list is stable enough at mount for this purpose.
  useEffect(() => {
    const persisted = workouts.find(workout => workout.status === 'active');
    if (persisted) {
      setActiveBlock({ type: 'workout', id: persisted.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync: if the active workout is completed/cancelled externally, clear activeBlock.
  useEffect(() => {
    if (activeBlock?.type !== 'workout') return;
    const currentWorkout = workouts.find(workout => workout.id === activeBlock.id);
    if (!currentWorkout || currentWorkout.status !== 'active') {
      setActiveBlock(null);
    }
  }, [workouts, activeBlock, setActiveBlock]);

  // ---------------------------------------------------------------------------
  // Derived execution objects (used by promoted overlays)
  // ---------------------------------------------------------------------------
  const activeWorkoutId = activeBlock?.type === 'workout' ? activeBlock.id : null;

  const activeWorkout = useMemo(
    () => (activeWorkoutId ? workouts.find(w => w.id === activeWorkoutId) ?? null : null),
    [activeWorkoutId, workouts],
  );

  const activeRoutine = activeBlock?.type === 'routine'
    ? (routines.find(r => r.id === activeBlock.id) ?? null)
    : null;

  // ---------------------------------------------------------------------------
  // Workout execution handlers (promoted from FitnessScreen for shell-level WorkoutPlayer)
  // ---------------------------------------------------------------------------
  function shellUpdateWorkoutById(workoutId, updater) {
    setWorkouts(current => current.map((workout, index) => (
      workout.id === workoutId ? normalizeWorkoutRecord(updater(workout), index) : workout
    )));
  }

  function shellUpsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function shellMergeWorkoutLog(workout, patch = {}) {
    const currentSegments = Array.isArray(workout.workoutLog?.segments)
      ? workout.workoutLog.segments : [];
    const nextSegments = Array.isArray(patch.segments)
      ? patch.segments
      : patch.segment
        ? [...currentSegments.filter(e => e.id !== patch.segment.id), patch.segment]
        : currentSegments;
    return normalizeWorkoutLog({
      ...(workout.workoutLog || {}),
      ...patch,
      startedAt: workout.startedAt || workout.workoutLog?.startedAt || Date.now(),
      segments: nextSegments,
    }, { startedAt: workout.startedAt || workout.workoutLog?.startedAt || Date.now() });
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;
    shellUpdateWorkoutById(activeWorkoutId, w => ({ ...w, status: 'planned' }));
    setActiveBlock(null);
  }

  function completeWorkout(workoutLog) {
    if (!activeWorkoutId) return;
    const completedAt = Date.now();
    shellUpdateWorkoutById(activeWorkoutId, w => ({
      ...w,
      status: 'completed',
      completedAt,
      workoutLog: shellMergeWorkoutLog(w, {
        ...(workoutLog || {}),
        completionLoggedAt: workoutLog?.completionLoggedAt || completedAt,
        completionSource: workoutLog?.completionSource || 'manual_completion',
        lastUpdatedAt: completedAt,
        notes: typeof workoutLog?.notes === 'string' ? workoutLog.notes : (w.workoutLog?.notes || ''),
      }),
    }));
    shellUpsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    setActiveBlock(null);
  }

  function logCompletion(workoutLog) {
    completeWorkout(workoutLog);
  }

  function updateWorkoutLog(patch) {
    if (!activeWorkoutId) return;
    shellUpdateWorkoutById(activeWorkoutId, w => ({
      ...w,
      workoutLog: shellMergeWorkoutLog(w, patch),
    }));
  }

  const unreadNotifications = useMemo(
    () => notifications.filter(notification => !notification.read),
    [notifications],
  );
  const athleteDefaults = profile?.athlete || {};
  const workoutHistory = useMemo(
    () => workouts.map(workout => ({ ...workout, plannedDate: workout.plannedDate || workout.scheduledDate || null })),
    [workouts],
  );
  const shellPlanState = useMemo(
    () => getPlanState({
      startDate: fitnessSettings.programStartDate,
      trainingDays: fitnessSettings.trainingDays,
      programType: fitnessSettings.programType,
      today: now,
      history: workoutHistory,
      athleteDefaults,
    }),
    [athleteDefaults, fitnessSettings.programStartDate, fitnessSettings.programType, fitnessSettings.trainingDays, now, workoutHistory],
  );

  function openInboxPage() {
    setQuickAddOpen(false);
    setActiveSurface('inbox');
  }

  function openSettingsPage() {
    setQuickAddOpen(false);
    setActiveSurface('settings');
  }

  function openQuickCapture() {
    setQuickAddOpen(true);
  }


  function handleTabChange(tab) {
    setActiveTab(tab);
    setActiveSurface(null);
    setQuickAddOpen(false);
  }

  useEffect(() => {
    if (!isWorkoutPastCutoff(now)) return;

    const todayKey = toDateKey(now);
    const todaySession = shellPlanState.sessions.find(session => session.dateKey === todayKey) ?? null;
    if (!todaySession) return;

    const todayWorkouts = workouts.filter(workout => (
      workout.scheduledDate === todayKey || workout.plannedDate === todayKey
    ));
    if (todayWorkouts.some(workout => ['completed', 'active', 'skipped'].includes(workout.status))) return;

    const existingWorkout = todayWorkouts[0] ?? null;
    const missedAt = Date.now();

    if (existingWorkout) {
      setWorkouts(current => current.map((workout, index) => (
        workout.id === existingWorkout.id
          ? normalizeWorkoutRecord({
              ...workout,
              status: 'skipped',
              workoutLog: normalizeWorkoutLog({
                ...(workout.workoutLog || {}),
                source: 'manual',
                startedAt: workout.startedAt || workout.workoutLog?.startedAt || null,
                lastUpdatedAt: missedAt,
                completionLoggedAt: missedAt,
                completionSource: 'missed_cutoff',
                notes: workout.workoutLog?.notes || '',
                currentSegmentId: workout.workoutLog?.currentSegmentId || null,
                currentSegmentIndex: Number.isFinite(workout.workoutLog?.currentSegmentIndex) ? workout.workoutLog.currentSegmentIndex : 0,
                segments: Array.isArray(workout.workoutLog?.segments) ? workout.workoutLog.segments : [],
                externalRefs: workout.workoutLog?.externalRefs || {},
              }),
            }, index)
          : workout
      )));
    } else {
      const missedWorkout = createWorkoutFromSession({
        createWorkout,
        createExercise,
        session: todaySession,
        settings: fitnessSettings,
        todayKey,
        scheduledDateOverride: todayKey,
        plannedDateOverride: todayKey,
        statusOverride: 'skipped',
      });
      setWorkouts(current => [normalizeWorkoutRecord({
        ...missedWorkout,
        workoutLog: normalizeWorkoutLog({
          source: 'manual',
          lastUpdatedAt: missedAt,
          completionLoggedAt: missedAt,
          completionSource: 'missed_cutoff',
          notes: '',
          currentSegmentId: null,
          currentSegmentIndex: 0,
          segments: [],
          externalRefs: {},
        }),
      }, current.length), ...current]);
    }

    setNotifications(current => [
      createNotification({
        title: 'Workout marked missed',
        detail: `${todaySession.label || todaySession.title || "Today's workout"} was not completed by 8:00 PM.`,
      }),
      ...current,
    ]);
  }, [
    createExercise,
    createNotification,
    createWorkout,
    fitnessSettings,
    now,
    setNotifications,
    setWorkouts,
    shellPlanState.sessions,
    workouts,
  ]);

  const activeCopy = SHELL_TAB_COPY[activeTab] ?? SHELL_TAB_COPY.home;

  // Execution overlays take priority over surface and tab routing.
  // They are mounted here so they survive tab switches.
  const shellContent = activeBlock?.type === 'workout' && activeWorkout ? (
    <WorkoutPlayer
      workout={activeWorkout}
      onCancel={cancelWorkout}
      onComplete={completeWorkout}
      onLogCompletion={logCompletion}
      onUpdateWorkoutLog={updateWorkoutLog}
    />
  ) : activeBlock?.type === 'focus' ? (
    <div className="tab-stack">
      <Card variant="flat" className="home-card home-section home-focus-card">
        <SectionHeader eyebrow="Focus" title="Deep work session" />
        <FocusTimer
          session={focusSession}
          onStop={() => {
            setActiveBlock(null);
            setFocusSessionDetails(s => ({ ...s, startedAt: null }));
          }}
          onDismiss={() => {
            setActiveBlock(null);
            setFocusSessionDetails({ taskLabel: '', durationMinutes: 25, startedAt: null });
          }}
        />
      </Card>
    </div>
  ) : activeSurface === 'inbox' ? (
    <InboxSurface
      inboxItems={inboxItems}
      onClose={() => setActiveSurface(null)}
    />
  ) : activeSurface === 'settings' ? (
    <SettingsSurface
      onClose={() => setActiveSurface(null)}
      fitnessSettings={fitnessSettings}
      notificationPrefs={notificationPrefs}
      recoveryInputs={recoveryInputs}
      mealPrefs={mealPrefs}
      profile={profile}
    />
  ) : activeTab === 'home' ? (
    <HomeDashboard now={now} />
  ) : activeTab === 'fitness' ? (
    <FitnessScreen
      now={now}
      activeWorkoutId={activeWorkoutId}
      onStartWorkout={id => setActiveBlock(id ? { type: 'workout', id } : null)}
    />
  ) : activeTab === 'calendar' ? (
    <CalendarScreen onOpenSettings={openSettingsPage} />
  ) : activeTab === 'more' ? (
    <MoreScreen now={now} onSwitchToTab={handleTabChange} />
  ) : (
    <div className="tab-stack shell-stack">
      <section className="shell-hero task-card">
        <p className="eyebrow">Phase 1 shell</p>
        <h2>Stable navigation and layout are locked</h2>
        <p className="shell-hero-copy">
          This rebuild branch keeps the app shell fixed so later phases can fill in real Home, Calendar, Fitness, and More content without changing navigation.
        </p>
      </section>

      <div className="shell-tab-panels">
        {Object.entries(SHELL_TAB_COPY).map(([tabId, copy]) => (
          <ShellTabPanel
            key={tabId}
            active={tabId === activeTab}
            eyebrow={copy.eyebrow}
            title={copy.title}
            description={copy.description}
            bullets={copy.bullets}
          />
        ))}
      </div>

      <section className="task-card shell-status-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Current tab</p>
            <h2>{activeCopy.title}</h2>
          </div>
          <span className="status-pill status-planned">Mounted</span>
        </div>
        <p className="shell-status-copy">{activeCopy.description}</p>
      </section>
    </div>
  );

  return (
    <>
      <AppFrame
        tabs={ROOT_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userName="Alexis"
        inboxCount={unreadNotifications.length}
        onOpenInbox={openInboxPage}
        onOpenQuickAdd={openQuickCapture}
        onOpenSettings={openSettingsPage}
        showQuickAddFab={activeTab !== 'calendar' || activeSurface !== null}
      >
        {shellContent}
      </AppFrame>
      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        todayKey={toDateKey(now)}
      />
      {/* RoutinePlayer portals to document.body internally; mounted here so it
          survives HomeDashboard unmounting on tab switch. */}
      {activeRoutine && (
        <RoutinePlayer
          routine={activeRoutine}
          onClose={() => setActiveBlock(null)}
          onComplete={routineId =>
            setRoutines(current =>
              current.map(r => r.id === routineId ? { ...r, lastCompleted: toDateKey(now) } : r)
            )
          }
        />
      )}
      {/* MorningCheckinModal portals to document.body; self-gates on showMorningCheckin. */}
      <MorningCheckinModal />
    </>
  );
}

function App() {
  return (
    <ProfileProvider>
      <TaskProvider>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </TaskProvider>
    </ProfileProvider>
  );
}

const rootElement = document.getElementById('root');
const loadingElement = document.getElementById('loading');

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

requestAnimationFrame(() => {
  loadingElement?.remove();
});
