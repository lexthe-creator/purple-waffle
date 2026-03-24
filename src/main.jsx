import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppFrame from './components/AppFrame.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import InboxView from './views/InboxView.jsx';
import InboxScreen from './views/InboxScreen.jsx';
import FinanceScreen from './views/FinanceScreen.jsx';
import HomeScreen from './views/HomeScreen.jsx';
import MorningCheckinModal from './components/MorningCheckinModal.jsx';
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
    id: 'today',
    label: 'Today',
    iconPath: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z"/><polyline points="9 21 9 12 15 12 15 21"/>',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    iconPath: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    iconPath: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    iconPath: '<rect x="6" y="9" width="12" height="6" rx="3"/><path d="M4 12h2"/><path d="M18 12h2"/><path d="M7.5 9V7.5"/><path d="M16.5 9V7.5"/><path d="M7.5 15v1.5"/><path d="M16.5 15v1.5"/>',
  },
  {
    id: 'more',
    label: 'More',
    iconPath: '<path d="M12 5v14"/><path d="M5 12h14"/><circle cx="12" cy="12" r="9"/>',
  },
];

const FITNESS_SUBTABS = [
  { id: 'today', label: 'Today' },
  { id: 'plan', label: 'Plan' },
  { id: 'library', label: 'Library' },
  { id: 'history', label: 'History' },
];

const MORE_SECTIONS = [
  { id: 'recovery', label: 'Recovery / Health' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'insights', label: 'Insights' },
  { id: 'finance', label: 'Finance' },
  { id: 'settings', label: 'Settings' },
  { id: 'inbox', label: 'Inbox' },
];

const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'];
const RACE_CATEGORIES = ['Open', 'Pro', 'Masters'];
const AVAILABLE_PROGRAMS = [
  {
    id: 'hyrox',
    label: 'HYROX 32-week plan',
    description: 'Current generator and plan views are fully wired for HYROX.',
  },
  {
    id: '5k',
    label: '5K run builder',
    description: 'Available for program selection; full downstream UI is still being phased in.',
  },
  {
    id: 'strength',
    label: 'Strength block',
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

function formatDateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function formatShortMonthDay(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatShortTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function sameDay(left, right) {
  return toDateKey(left) === toDateKey(right);
}

function toDateKey(value) {
  return startOfDay(value).toISOString().slice(0, 10);
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

  if (['hyrox', 'strength', 'running', 'pilates', 'recovery', 'hybrid', 'run'].includes(rawType)) return rawType;
  if (rawName.includes('hyrox')) return 'hyrox';
  if (rawName.includes('pilates')) return 'pilates';
  if (rawName.includes('recover') || rawName.includes('mobility') || rawName.includes('stretch')) return 'recovery';
  if (rawName.includes('run')) return 'running';
  return 'strength';
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
  const selectedCurrent = currentWeek.filter(workout => inferWorkoutProgram(workout) === programType);

  return {
    workoutsCompleted: completedCurrent.length,
    milesCompleted: completedCurrent.reduce((total, workout) => total + (Number.isFinite(workout.distanceMiles) ? workout.distanceMiles : 0), 0),
    strengthSessions: completedCurrent.filter(workout => ['strength', 'hyrox', 'hybrid'].includes(inferWorkoutProgram(workout))).length,
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

function createWorkoutFromSession({ createWorkout, createExercise, session, settings, todayKey }) {
  const sessionType = session?.type || 'hyrox';
  const normalizedProgramType = session?.programType || settings?.programType || 'hyrox';
  const programName = normalizedProgramType === '5k' ? '5K run builder' : 'HYROX 32-week plan';
  const prescribedExercises = Array.isArray(session?.ex) && session.ex.length > 0
    ? session.ex.map(item => createExercise({
      name: item.n || 'Exercise',
      detail: `${item.s || '1'} sets · ${item.r || ''}${item.note ? ` · ${item.note}` : ''}`.trim(),
      sets: Number.parseInt(item.s, 10) || null,
      reps: typeof item.r === 'string' ? item.r : null,
    }))
    : [
      createExercise({ name: 'Warm-up', detail: '5-10 min easy movement' }),
      createExercise({ name: session.title || session.label || 'Main set', detail: session.detail || session.label || 'Training session', sets: 3 }),
      createExercise({ name: 'Cooldown', detail: '5 min mobility' }),
    ];
  const scheduledDate = session?.dateKey || todayKey;
  const workout = createWorkout({
    name: session.label || session.title || 'HYROX Session',
    programId: normalizedProgramType,
    programName,
    type: sessionType.includes('run')
      ? 'run'
      : sessionType.includes('hyrox')
        ? 'hyrox'
        : sessionType.includes('recovery')
          ? 'recovery'
          : 'strength',
    status: 'planned',
    scheduledDate,
    plannedDate: scheduledDate,
    sessionOffset: session.offset ?? null,
    trainingDays: settings.trainingDays,
    programType: normalizedProgramType,
    phase: session.phase || '',
    week: session.week || null,
    duration: session.duration || 45,
    exercises: prescribedExercises,
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

function SettingsScreen() {
  const {
    fitnessSettings,
    setFitnessSettings,
    workCalendarPrefs,
    setWorkCalendarPrefs,
    mealPrefs,
    setMealPrefs,
    notificationPrefs,
    setNotificationPrefs,
    calendarPatterns,
    setCalendarPatterns,
    recoveryInputs,
    setRecoveryInputs,
  } = useAppContext();
  const { profile, updateAthlete } = useProfileContext();

  const [draft, setDraft] = useState(() => ({ ...fitnessSettings }));
  const [athleteDraft, setAthleteDraft] = useState(() => ({ ...profile.athlete }));

  useEffect(() => {
    setDraft({ ...fitnessSettings });
    setAthleteDraft({ ...profile.athlete });
  }, [fitnessSettings, profile.athlete]);

  const weakStations = Array.isArray(athleteDraft.weakStations) ? athleteDraft.weakStations : [];

  function patch(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function patchAthlete(key, value) {
    setAthleteDraft(current => ({ ...current, [key]: value }));
  }

  function toggleStation(key) {
    setAthleteDraft(current => {
      const active = Array.isArray(current.weakStations) ? current.weakStations : [];
      return {
        ...current,
        weakStations: active.includes(key) ? active.filter(station => station !== key) : [...active, key],
      };
    });
  }

  function save() {
    setFitnessSettings(current => ({ ...current, ...draft }));
    updateAthlete(athleteDraft);
  }

  return (
    <div className="tab-stack settings-page">
      <Card>
        <SectionHeader eyebrow="Settings" title="Configuration" />
        <p className="empty-message">Adjust app preferences and training defaults from one dedicated page.</p>
      </Card>

      <div className="settings-stack">
        <ExpandablePanel header={<strong>Program Setup</strong>} defaultOpen>
          <div className="field-stack">
            <div className="field-stack compact-field">
              <p className="eyebrow">Program</p>
              <label className="field-stack compact-field">
                <span>Active program</span>
                <div className="segmented-control">
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
              </label>
              <div className="field-stack compact-field">
                <span>Available programs</span>
                <div className="subtle-feed">
                  {AVAILABLE_PROGRAMS.map(program => (
                    <ListRow
                      key={program.id}
                      variant="card"
                      label={program.label}
                      sub={program.description}
                      action={(
                        <button
                          type="button"
                          className={`ghost-button compact-ghost ${draft.programType === program.id ? 'is-active' : ''}`}
                          onClick={() => patch('programType', program.id)}
                        >
                          {draft.programType === program.id ? 'Active' : 'Select'}
                        </button>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="field-stack compact-field">
              <p className="eyebrow">Timeline</p>
              <label className="field-stack compact-field">
                <span>Event date</span>
                <input
                  type="date"
                  className="task-title-input"
                  value={draft.raceDate ?? ''}
                  onChange={e => patch('raceDate', e.target.value || null)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>Program start date</span>
                <input
                  type="date"
                  className="task-title-input"
                  value={draft.programStartDate ?? ''}
                  onChange={e => patch('programStartDate', e.target.value || new Date().toISOString().slice(0, 10))}
                />
              </label>
            </div>

            <div className="field-stack compact-field">
              <p className="eyebrow">Training Structure</p>
              <label className="field-stack compact-field">
                <span>Training days per week</span>
                <div className="segmented-control">
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
                <span>Equipment preferences</span>
                <div className="segmented-control">
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
            </div>
          </div>
        </ExpandablePanel>

        <div className="settings-section-divider" aria-hidden="true" />

          <ExpandablePanel header={<strong>Athlete Profile</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field">
                <span>Fitness level</span>
                <div className="segmented-control">
                  {FITNESS_LEVELS.map(level => (
                    <button
                      key={level}
                      type="button"
                      className={`status-chip ${draft.fitnessLevel === level ? 'is-active' : ''}`}
                      onClick={() => patch('fitnessLevel', level)}
                    >
                      {level}
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
                      onClick={() => toggleStation(station)}
                    >
                      {station}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field-stack compact-field">
                <span>Injuries or limitations</span>
                <textarea
                  className="task-title-input"
                  rows={3}
                  value={draft.injuriesOrLimitations ?? ''}
                  onChange={e => patch('injuriesOrLimitations', e.target.value)}
                />
              </label>
            </div>
          </ExpandablePanel>

          <ExpandablePanel header={<strong>Work Calendar</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field">
                <span>Planning order</span>
                <div className="segmented-control">
                  {['priority', 'time'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={`status-chip ${workCalendarPrefs.planningOrder === opt ? 'is-active' : ''}`}
                      onClick={() => setWorkCalendarPrefs(p => ({ ...p, planningOrder: opt }))}
                    >
                      {opt === 'priority' ? 'Priority first' : 'Chronological'}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field-stack compact-field">
                <span>Busy-block behavior</span>
                <div className="segmented-control">
                  {['hard', 'soft'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={`status-chip ${workCalendarPrefs.busyBlockBehavior === opt ? 'is-active' : ''}`}
                      onClick={() => setWorkCalendarPrefs(p => ({ ...p, busyBlockBehavior: opt }))}
                    >
                      {opt === 'hard' ? 'Hard block' : 'Soft block'}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          </ExpandablePanel>

          <ExpandablePanel header={<strong>Nutrition</strong>}>
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
          </ExpandablePanel>

          <ExpandablePanel header={<strong>Recovery + Calendar</strong>}>
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
                <span>Busy-block behavior</span>
                <div className="segmented-control">
                  {['hard', 'soft'].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={`status-chip ${workCalendarPrefs.busyBlockBehavior === opt ? 'is-active' : ''}`}
                      onClick={() => setWorkCalendarPrefs(p => ({ ...p, busyBlockBehavior: opt }))}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </label>
              <p className="empty-message">Saved patterns: {calendarPatterns.length}. Recovery inputs and patterns are stored locally.</p>
            </div>
          </ExpandablePanel>

          <ExpandablePanel header={<strong>Notifications</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Morning reminder</span>
                <input
                  type="checkbox"
                  checked={notificationPrefs.morningReminder}
                  onChange={e => setNotificationPrefs(p => ({ ...p, morningReminder: e.target.checked }))}
                />
              </label>
              <label className="field-stack compact-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Workout reminder</span>
                <input
                  type="checkbox"
                  checked={notificationPrefs.workoutReminder}
                  onChange={e => setNotificationPrefs(p => ({ ...p, workoutReminder: e.target.checked }))}
                />
              </label>
            </div>
          </ExpandablePanel>
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
    <div className="tab-stack execution-home-stack">
      <section className="task-card execution-hero-card today-hero">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">{formatFullDate(now)}</p>
            <h2>Today&apos;s Workout</h2>
          </div>
        </div>

        <div className="execution-hero-copy">
          <div>
            <div className="execution-title-row">
              <strong className="execution-title">{workoutName}</strong>
              <span className="status-pill">{workoutDuration}</span>
            </div>
            <p className="execution-subtitle">{workoutDetail}</p>
          </div>
          <span className={`status-pill ${workoutStatus === 'Reduced volume' ? 'status-planned' : workoutStatus === 'Recovery day' || workoutStatus === 'Recovery replacement' ? 'pill-warning' : 'status-active'}`}>
            {workoutStatus}
          </span>
        </div>

        <div className="inline-actions">
          <button type="button" className="primary-button" onClick={workoutLaunch}>
            {activeWorkout ? 'Continue workout' : 'Start workout'}
          </button>
          <button type="button" className="secondary-button" onClick={onSwitchToFitness}>
            View plan
          </button>
        </div>
        <div className="execution-summary-grid" style={{ marginTop: '12px' }}>
          <div className="summary-tile">
            <span>Race countdown</span>
            <strong>{daysToRace === null ? 'Not set' : `${daysToRace}d`}</strong>
          </div>
          <div className="summary-tile">
            <span>Readiness</span>
            <strong>{readiness.level}</strong>
          </div>
          <div className="summary-tile">
            <span>Week</span>
            <strong>{planState.week}</strong>
          </div>
        </div>

        {todaysWorkout?.ex?.length > 0 && (
          <div className="subtle-feed" style={{ marginTop: '12px' }}>
            {todaysWorkout.ex.map((item, index) => (
              <ListRow
                key={`${item.n}-${index}`}
                variant="card"
                label={item.n}
                sub={`${item.s || '1'} sets · ${item.r || ''}${item.note ? ` · ${item.note}` : ''}`}
              />
            ))}
          </div>
        )}
      </section>

      {(todaysWorkout?.winTheDayTargets?.length > 0 || winTheDayChecklist.length > 0) && (
        <section className="task-card">
          <SectionHeader eyebrow="Win the day" title="Do this now" />
          <div className="subtle-feed">
            {winTheDayChecklist.map(item => (
              <ListRow key={item.id} variant="card" label={`${item.done ? '✓' : '○'} ${item.label}`} />
            ))}
            {(todaysWorkout?.winTheDayTargets || []).map(target => (
              <ListRow key={target} variant="card" label={target} sub={todaysWorkout.label} />
            ))}
          </div>
        </section>
      )}

      <section className="task-card">
        <SectionHeader eyebrow="Weekly strip" title="Planned vs done" />
        <div className="tag-row">
          {weeklyStrip.map(day => (
            <span
              key={day.id}
              className={`status-chip ${day.status === 'completed' ? 'is-active' : ''}`}
              title={`${day.label} · ${day.status}`}
            >
              {day.day} {day.status === 'today' ? '•' : day.status === 'completed' ? '✓' : day.status === 'moved' ? '→' : day.status === 'missed' ? '!' : ''}
            </span>
          ))}
        </div>
      </section>

      <div className="execution-stack">
        <section className="task-card execution-summary-card">
          <div className="task-card-header">
            <div>
              <p className="eyebrow">Workout suggestions</p>
              <h2>Recovery-aware options</h2>
            </div>
          </div>
          {todaySuggestions.length > 0 ? (
            <div className="subtle-feed">
              {todaySuggestions.map(item => (
                <ListRow key={item.id} variant="card" label={item.title} sub={item.detail} />
              ))}
            </div>
          ) : (
            <p className="empty-message">No suggestions. Start with the planned workout.</p>
          )}
        </section>

        <section className="task-card execution-summary-card">
          <div className="task-card-header">
            <div>
              <p className="eyebrow">Nutrition today</p>
              <h2>Have you eaten?</h2>
            </div>
            <button type="button" className="ghost-button compact-ghost" onClick={() => onOpenMoreSection?.('meals')}>
              Open Nutrition
            </button>
          </div>
          <div className="execution-summary-grid">
            <div className="summary-tile">
              <span>Meals logged</span>
              <strong>{mealCount}</strong>
            </div>
            <div className="summary-tile">
              <span>Hydration</span>
              <strong>{hydrationCount}/{mealPrefs.hydrationGoal}</strong>
            </div>
            <div className="summary-tile">
              <span>Latest</span>
              <strong>{todaysMeals[0]?.name || 'Nothing yet'}</strong>
            </div>
          </div>
        </section>

        <section className="task-card execution-summary-card">
          <div className="task-card-header">
            <div>
              <p className="eyebrow">Recovery</p>
              <h2>How are you recovering?</h2>
            </div>
            <button type="button" className="ghost-button compact-ghost" onClick={() => onOpenMoreSection?.('health')}>
              Open Recovery
            </button>
          </div>
          <div className="execution-summary-grid">
            <div className="summary-tile">
              <span>Readiness</span>
              <strong>{readiness.level}</strong>
            </div>
            <div className="summary-tile">
              <span>Sleep</span>
              <strong>{Number.isFinite(energyState.sleepHours) ? `${energyState.sleepHours}h` : '—'}</strong>
            </div>
            <div className="summary-tile">
              <span>Energy</span>
              <strong>{Number.isFinite(energyState.value) ? `${energyState.value}/10` : '—'}</strong>
            </div>
          </div>
          <p className="empty-message">{readiness.level === 'Low' ? 'Recovery is the right call today.' : readiness.level === 'Moderate' ? 'Reduced volume keeps the day productive.' : 'You are good to push the plan.'}</p>
        </section>

        <section className="task-card execution-summary-card">
          <div className="task-card-header">
            <div>
              <p className="eyebrow">Habits / Lifestyle</p>
              <h2>Habits today</h2>
            </div>
            <button type="button" className="ghost-button compact-ghost" onClick={() => onOpenMoreSection?.('habits')}>
              Open Lifestyle
            </button>
          </div>
          <div className="execution-summary-grid">
            <div className="summary-tile">
              <span>Habits total</span>
              <strong>{habitList.length}</strong>
            </div>
            <div className="summary-tile">
              <span>Completed today</span>
              <strong>{completedHabits.length}</strong>
            </div>
            <div className="summary-tile">
              <span>Top habit</span>
              <strong>{habitPreview[0]?.title || 'None yet'}</strong>
            </div>
          </div>
          {habitPreview.length > 0 ? (
            <div className="subtle-feed">
              {habitPreview.map(habit => (
                <ListRow
                  key={habit.id}
                  variant="card"
                  label={habit.title || 'Habit'}
                  sub={habit.frequency || 'daily'}
                />
              ))}
            </div>
          ) : (
            <p className="empty-message">Use Lifestyle for routines, repetition, and low-friction structure.</p>
          )}
        </section>
      </div>

      <div className="execution-secondary-actions">
        <button type="button" className="secondary-button" onClick={onOpenInbox}>
          Open Inbox
        </button>
        <button type="button" className="secondary-button" onClick={() => onOpenMoreSection?.('tasks')}>
          Open More
        </button>
      </div>
    </div>
  );
}

function CalendarScreen() {
  const { tasks, meals, workouts, calendarItems, setCalendarItems } = useTaskContext();
  const { fitnessSettings } = useAppContext();
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [editingItemId, setEditingItemId] = useState(null);
  const [draftType, setDraftType] = useState('busy');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('10:00');
  const [draftNotes, setDraftNotes] = useState('');
  const [draftPriority, setDraftPriority] = useState(false);
  const [patternName, setPatternName] = useState('Weekly pattern');
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
        subtitle: `${session.dayLabel} · ${planState.programLabel} · ${session.detail || session.title}`,
      }));

    const calendarDayItems = calendarItems
      .filter(item => item.date === selectedDate)
      .map(item => ({
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: `${item.startTime} - ${item.endTime}${item.priority ? ' · priority' : ''}`,
        notes: item.notes,
      }));

    const taskItems = tasks.slice(0, 6).map(task => ({
      id: `task-${task.id}`,
      type: 'task',
      title: task.title,
      subtitle: task.status,
    }));

    const mealItems = meals
      .filter(meal => toDateKey(meal.loggedAt) === selectedDate)
      .map(meal => ({
        id: `meal-${meal.id}`,
        type: 'meal',
        title: meal.name,
        subtitle: Array.isArray(meal.tags) && meal.tags.length ? meal.tags.join(' · ') : 'Logged meal',
      }));

    const workoutItems = workouts
      .filter(workout => workout.scheduledDate === selectedDate || toDateKey(workout.createdAt) === selectedDate)
      .map(workout => ({
        id: `workout-${workout.id}`,
        type: 'workout',
        title: workout.name,
        subtitle: `${workout.status} · ${workout.duration || 30} min`,
      }));

    return [...calendarDayItems, ...scheduleItems, ...mealItems, ...workoutItems, ...taskItems];
  }, [calendarItems, meals, planState.sessions, selectedDate, tasks, workouts]);

  const selectedCalendarItem = useMemo(
    () => calendarItems.find(item => item.id === editingItemId) ?? null,
    [calendarItems, editingItemId],
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

  function resetDraft() {
    setEditingItemId(null);
    setDraftType('busy');
    setDraftTitle('');
    setDraftStartTime('09:00');
    setDraftEndTime('10:00');
    setDraftNotes('');
    setDraftPriority(false);
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
    <div className="tab-stack">
      <Card>
        <SectionHeader eyebrow="Calendar" title="Weekly planning workspace" />
        <div className="calendar-nav">
          <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, -7)))}>
            Previous week
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(new Date()))}>
            Today
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, 7)))}>
            Next week
          </button>
        </div>
        <p className="empty-message">
          Planning order: {workCalendarPrefs.planningOrder} · Busy blocks: {workCalendarPrefs.busyBlockBehavior}
        </p>
      </Card>

      <Card>
        <div className="week-strip calendar-week-strip">
          {weekDays.map(day => (
            <button
              key={day.key}
              type="button"
              className={`week-strip-item ${selectedDate === day.key ? 'is-active' : ''} ${day.isToday ? 'is-today' : ''}`}
              onClick={() => setSelectedDate(day.key)}
            >
              <strong>{day.label}</strong>
              <p>{day.dateLabel}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Selected day" title={formatFullDate(selectedDate)} />
        <div className="subtle-feed">
          {selectedDayItems.length === 0 ? (
            <EmptyState title="No items scheduled" description="Add a busy block, event, or weekly pattern." />
          ) : (
            selectedDayItems.map(item => (
              <ListRow
                key={item.id}
                variant="card"
                label={item.title}
                sub={item.subtitle || item.type}
                action={item.type === 'plan' ? undefined : (
                  <button
                    type="button"
                    className="ghost-button compact-ghost"
                    onClick={() => {
                      const match = calendarItems.find(calendarItem => calendarItem.id === item.id);
                      if (!match) return;
                      setEditingItemId(match.id);
                    }}
                  >
                    Edit
                  </button>
                )}
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow={editingItemId ? 'Edit item' : 'Add item'} title="Busy blocks, events, or tasks" />
        <div className="field-stack">
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
          />
          <div className="calendar-time-row">
            <input className="task-title-input" type="time" value={draftStartTime} onChange={event => setDraftStartTime(event.target.value)} />
            <input className="task-title-input" type="time" value={draftEndTime} onChange={event => setDraftEndTime(event.target.value)} />
          </div>
          <textarea
            className="task-title-input"
            rows={3}
            value={draftNotes}
            onChange={event => setDraftNotes(event.target.value)}
            placeholder="Notes"
          />
          <label className="field-stack compact-field" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Priority</span>
            <input type="checkbox" checked={draftPriority} onChange={event => setDraftPriority(event.target.checked)} />
          </label>
          <div className="inline-actions">
            <button type="button" className="primary-button" onClick={saveCalendarItem}>
              {editingItemId ? 'Save changes' : 'Add item'}
            </button>
            {editingItemId && (
              <button type="button" className="ghost-button compact-ghost" onClick={resetDraft}>
                Cancel edit
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Patterns" title="Save and reapply weekly layouts" />
        <div className="field-stack">
          <input
            className="task-title-input"
            value={patternName}
            onChange={event => setPatternName(event.target.value)}
            placeholder="Pattern name"
          />
          <button type="button" className="secondary-button" onClick={savePattern}>
            Save selected day as pattern
          </button>
        </div>
        <div className="subtle-feed">
          {calendarPatterns.length === 0 ? (
            <EmptyState title="No saved patterns" description="Capture a repeatable day and reapply it next week." />
          ) : (
            calendarPatterns.map(pattern => (
              <ListRow
                key={pattern.id}
                variant="card"
                label={pattern.name}
                sub={`${pattern.items.length} items · ${pattern.sourceDate}`}
                action={(
                  <button type="button" className="ghost-button compact-ghost" onClick={() => applyPattern(pattern)}>
                    Apply next week
                  </button>
                )}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function NutritionScreen({ now }) {
  const { meals, setMeals, createMeal, setNotifications, createNotification, pantryItems, setPantryItems } = useTaskContext();
  const { mealPrefs } = useAppContext();
  const [mealName, setMealName] = useState('');
  const [mealTags, setMealTags] = useState([]);
  const [mealSlot, setMealSlot] = useState('auto');
  const [planDrafts, setPlanDrafts] = useState(() => Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, ''])));
  const [pantryDraft, setPantryDraft] = useState('');
  const [prepNote, setPrepNote] = useState('');
  const [selectedPlanDay, setSelectedPlanDay] = useState(() => toDateKey(now));
  const todayKey = toDateKey(now);

  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );

  const todaysFuelMeals = useMemo(
    () => todaysMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('water')),
    [todaysMeals],
  );

  const hydrationCount = useMemo(
    () => todaysMeals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('water')).length,
    [todaysMeals],
  );

  const mealSlots = useMemo(() => NUTRITION_SLOTS.map(slot => {
    const slotMeals = todaysFuelMeals.filter(meal => {
      const slotTag = meal.tags?.find(tag => typeof tag === 'string' && tag.startsWith('slot:'))?.slice(5);
      return slotTag === slot.id || `${meal.name} ${meal.tags.join(' ')}`.toLowerCase().includes(slot.keywords[0]);
    });
    return {
      ...slot,
      planned: slotMeals.filter(meal => Array.isArray(meal.tags) && meal.tags.includes('planned')),
      logged: slotMeals.filter(meal => !Array.isArray(meal.tags) || !meal.tags.includes('planned')),
    };
  }), [todaysFuelMeals]);

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
    todaysFuelMeals.forEach(meal => {
      counts.protein += Array.isArray(meal.tags) && meal.tags.includes('protein') ? 1 : 0;
      counts.carbs += Array.isArray(meal.tags) && meal.tags.includes('carbs') ? 1 : 0;
      counts.veg += Array.isArray(meal.tags) && meal.tags.includes('veg') ? 1 : 0;
      counts.quick += Array.isArray(meal.tags) && meal.tags.includes('quick') ? 1 : 0;
    });
    return counts;
  }, [todaysFuelMeals]);

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

  return (
    <div className="tab-stack nutrition-stack">
      <Card>
        <SectionHeader eyebrow="Nutrition" title="Today’s fuel" />
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
        <SectionHeader eyebrow="Today’s meals" title="Planned vs logged by slot" />
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
  const { workouts, notes, setWorkouts, setNotifications, createNotification, createWorkout, createExercise } = useTaskContext();
  const { energyState, setEnergyState, fitnessSettings } = useAppContext();
  const { profile } = useProfileContext();
  const [activeSubTab, setActiveSubTab] = useState('today');
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
  const weekStartKey = toDateKey(alignDateToAnchor(now, 'Monday'));
  const programCountdown = fitnessSettings.raceDate
    ? Math.max(0, Math.round((startOfDay(`${fitnessSettings.raceDate}T00:00:00`) - startOfDay(now)) / 86_400_000))
    : null;

  const workoutHistory = useMemo(
    () => workouts.map(workout => ({
      type: getCurrentWorkoutType(workout),
      date: workout.scheduledDate || toDateKey(workout.createdAt),
      data: { plannedDate: workout.scheduledDate || null, calories: workout.calories || 0 },
    })),
    [workouts],
  );

  const weeklyAnalytics = useMemo(
    () => computeWeeklyAnalytics(workoutHistory, weekStartKey),
    [weekStartKey, workoutHistory],
  );
  const weeklyCompletionSummary = useMemo(() => {
    const completed = weeklySchedule.filter(session => session.status === 'completed').length;
    const missed = weeklySchedule.filter(session => session.status === 'missed' || session.status === 'skipped').length;
    const trainingMinutes = workouts
      .filter(workout => workout.scheduledDate && weeklySchedule.some(session => session.dateKey === workout.scheduledDate) && workout.status === 'completed')
      .reduce((total, workout) => total + (Number.isFinite(workout.duration) ? workout.duration : 0), 0);
    return { completed, missed, trainingMinutes };
  }, [weeklySchedule, workouts]);

  const recoveryState = useMemo(
    () => computeRecoveryState({ energyScore: checkInDraft.energy, sleepHours: checkInDraft.sleepHours }, checkInDraft.energy, checkInDraft.sleepHours),
    [checkInDraft.energy, checkInDraft.sleepHours],
  );

  const recoveryRecommendation = useMemo(() => {
    const baseWorkout = planState.sessions.find(session => toDateKey(session.date) === todayKey) ?? null;
    if (!baseWorkout) return null;
    return adjustWorkoutForRecovery({
      id: 'today-session',
      name: baseWorkout.label || baseWorkout.title,
      type: baseWorkout.type,
      ex: [],
    }, recoveryState);
  }, [planState.sessions, recoveryState, todayKey]);

  const todaySession = useMemo(
    () => weeklySchedule.find(session => toDateKey(session.date) === todayKey) ?? null,
    [todayKey, weeklySchedule],
  );

  const currentWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    const scheduledToday = workouts.find(workout => workout.scheduledDate === todayKey && workout.status !== 'completed');
    if (scheduledToday) return scheduledToday;
    const preferredType = fitnessSettings.programType === '5k' ? 'running' : 'hyrox';
    return workouts.find(workout => getCurrentWorkoutType(workout) === preferredType && workout.status !== 'completed')
      ?? workouts.find(workout => workout.status !== 'completed')
      ?? null;
  }, [activeWorkout, fitnessSettings.programType, todayKey, workouts]);

  const missedSessions = useMemo(
    () => weeklySchedule.filter(session => session.dateKey < todayKey && !workouts.some(workout => workout.scheduledDate === session.dateKey && workout.status === 'completed')),
    [todayKey, weeklySchedule, workouts],
  );

  const unacknowledgedMisses = useMemo(
    () => missedSessions.filter(session => !acknowledgedMisses.has(`miss-${session.dateKey}`)),
    [acknowledgedMisses, missedSessions],
  );

  const stationList = useMemo(() => ALL_STATIONS.map(name => getStationMeta(name)).filter(Boolean), []);
  const athletePaces = useMemo(() => computePaces(profile.athlete.fiveKTime ? Number.parseFloat(profile.athlete.fiveKTime) : null), [profile.athlete.fiveKTime]);

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function startWorkout(workoutId) {
    onStartWorkout(workoutId);
    const startedAt = Date.now();
    setWorkouts(current => current.map(workout => (
      workout.id === workoutId
        ? {
            ...workout,
            status: 'active',
            startedAt,
            type: getCurrentWorkoutType(workout),
            programId: fitnessSettings.programType || 'hyrox',
            programName: workout.programName || (fitnessSettings.programType === '5k' ? '5K run builder' : 'HYROX 32-week plan'),
          }
        : workout.status === 'active'
          ? { ...workout, status: 'planned' }
          : workout
    )));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;
    setWorkouts(current => current.map(workout => (workout.id === activeWorkoutId ? { ...workout, status: 'planned' } : workout)));
    onStartWorkout(null);
  }

  function completeWorkout(workoutLog) {
    if (!activeWorkoutId) return;
    const completedAt = Date.now();
    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId
        ? { ...workout, status: 'completed', completedAt, workoutLog: workoutLog || null }
        : workout
    )));
    upsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    onStartWorkout(null);
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

  function startTodaysWorkout() {
    if (!todaySession) return;
    const sessionWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session: todaySession,
      settings: fitnessSettings,
      todayKey: todaySession.dateKey || todayKey,
    });
    setWorkouts(current => [sessionWorkout, ...current]);
    startWorkout(sessionWorkout.id);
  }

  function moveMissedSession(session) {
    const laterThisWeek = weeklySchedule.find(nextSession => nextSession.dateKey > session.dateKey);
    const nextDate = laterThisWeek?.dateKey ?? toDateKey(addDays(new Date(`${session.dateKey}T00:00:00`), 7));
    const movedWorkout = createWorkout({
      name: session.label || session.title,
      programId: fitnessSettings.programType || 'hyrox',
      programName: fitnessSettings.programType === '5k' ? '5K run builder' : 'HYROX 32-week plan',
      type: session.type,
      status: 'planned',
      scheduledDate: nextDate,
      plannedDate: session.dateKey,
      sessionOffset: session.offset,
      trainingDays: fitnessSettings.trainingDays,
      phase: session.phase || '',
      week: programWeek,
      exercises: (session.ex || []).map(item => createExercise({
        name: item.n || 'Exercise',
        detail: `${item.s || '1'} sets · ${item.r || ''}${item.note ? ` · ${item.note}` : ''}`.trim(),
      })),
    });
    setWorkouts(current => [movedWorkout, ...current]);
    setAcknowledgedMisses(prev => new Set([...prev, `miss-${session.dateKey}`]));
    upsertNotification('Session rescheduled', `${session.label || session.title} moved to ${nextDate}`);
  }

  function skipMissedSession(session) {
    const skippedWorkout = createWorkout({
      name: session.label || session.title,
      programId: fitnessSettings.programType || 'hyrox',
      programName: fitnessSettings.programType === '5k' ? '5K run builder' : 'HYROX 32-week plan',
      type: session.type,
      status: 'skipped',
      scheduledDate: session.dateKey,
      plannedDate: session.dateKey,
      sessionOffset: session.offset,
      trainingDays: fitnessSettings.trainingDays,
      phase: session.phase || '',
      week: programWeek,
      duration: session.duration || 0,
      exercises: [],
    });
    setWorkouts(current => [skippedWorkout, ...current]);
    setAcknowledgedMisses(prev => new Set([...prev, `miss-${session.dateKey}`]));
    upsertNotification('Session skipped', session.label || session.title);
  }

  function updateWeeklySessionStatus(session, nextStatus) {
    if (nextStatus === 'completed') {
      const completedWorkout = createWorkoutFromSession({
        createWorkout,
        createExercise,
        session,
        settings: fitnessSettings,
        todayKey: session.dateKey,
      });
      setWorkouts(current => [{ ...completedWorkout, status: 'completed', completedAt: Date.now() }, ...current]);
      return;
    }
    if (nextStatus === 'skipped') {
      skipMissedSession(session);
    }
  }

  function moveWeeklySession(session, nextDate) {
    const movedWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session: { ...session, dateKey: nextDate },
      settings: fitnessSettings,
      todayKey: nextDate,
    });
    setWorkouts(current => [
      { ...movedWorkout, status: 'planned', plannedDate: session.dateKey, scheduledDate: nextDate },
      ...current,
    ]);
  }

  const selectedTrainingDays = weeklySchedule.length;

  return (
    <div className="tab-stack fitness-stack">
      {activeWorkout && (
        <WorkoutPlayer workout={activeWorkout} onCancel={cancelWorkout} onComplete={completeWorkout} />
      )}

      <section className="task-card fitness-nav-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Fitness</p>
            <h2>HYROX program</h2>
          </div>
        </div>

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
      </section>

      {activeSubTab === 'today' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="Plan state" title={planState.label} />
            <div className="ui-metrics-row">
              <MetricBlock value={programWeek} label="Week" />
              <MetricBlock value={programPhase} label="Phase" />
              <MetricBlock value={fitnessSettings.trainingDays} label="Frequency" />
            </div>
            <p className="empty-message">{planState.phase.theme}</p>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Daily check-in</p>
                <h2>Open the day with recovery context</h2>
              </div>
            </div>
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
                <p>Low energy or short sleep should move today toward recovery.</p>
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
          </section>

          {unacknowledgedMisses.length > 0 && (
            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Missed session</p>
                  <h2>{unacknowledgedMisses[0].label || unacknowledgedMisses[0].title}</h2>
                </div>
              </div>
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
            </section>
          )}

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Today’s workout</p>
                <h2>{todaySession ? (todaySession.label || todaySession.title) : currentWorkout?.name || 'Rest day'}</h2>
              </div>
            </div>
            {todaySession && !currentWorkout?.scheduledDate ? (
              <article className="feed-card">
                <strong>{todaySession.label || todaySession.title}</strong>
                <p>HYROX · {todaySession.detail || todaySession.title}</p>
                <p>Week {programWeek} · {programPhase} · {fitnessSettings.trainingDays}</p>
                {Array.isArray(todaySession.ex) && todaySession.ex.length > 0 && (
                  <div className="subtle-feed" style={{ marginTop: '8px' }}>
                    {todaySession.ex.map((item, index) => (
                      <ListRow
                        key={`${item.n}-${index}`}
                        variant="card"
                        label={item.n}
                        sub={`${item.s || '1'} sets · ${item.r || ''}${item.note ? ` · ${item.note}` : ''}`}
                      />
                    ))}
                  </div>
                )}
                {getSessionStations(todaySession).length > 0 && (
                  <p className="empty-message">{getSessionStations(todaySession).map(station => station.name).join(' · ')}</p>
                )}
                <button type="button" className="secondary-button" onClick={startTodaysWorkout}>
                  Start Today’s Workout
                </button>
              </article>
            ) : currentWorkout ? (
              <article className="feed-card">
                <strong>{currentWorkout.name}</strong>
                <p>{currentWorkout.programName || 'HYROX'} · {currentWorkout.duration} min · {currentWorkout.status}</p>
                <p>Week {programWeek} · {programPhase}</p>
                <button type="button" className="secondary-button" onClick={() => startWorkout(currentWorkout.id)}>
                  {activeWorkout ? 'Continue Workout' : 'Start Workout'}
                </button>
              </article>
            ) : (
              <div className="empty-panel">
                <strong>Rest day</strong>
                <p>No session scheduled today. Recovery is part of the program.</p>
              </div>
            )}
            {recoveryRecommendation && (
              <p className="empty-message">Recovery adjustment available: {recoveryRecommendation.adjustmentLabel || 'Planned Session'}</p>
            )}
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Weekly stats" title="Training progress and trend" />
            <div className="ui-metrics-row">
              <MetricBlock value={weeklyAnalytics.sessionsLogged} label="Sessions" />
              <MetricBlock value={weeklyCompletionSummary.completed} label="Completed" />
              <MetricBlock value={weeklyCompletionSummary.missed} label="Missed" />
              <MetricBlock value={weeklyCompletionSummary.trainingMinutes} label="Minutes" />
              <MetricBlock value={weeklyAnalytics.runMiles} label="Run mi" />
            </div>
            <p className="empty-message">
              Trend: {weeklyAnalytics.sessionsLogged >= 0 ? '+' : ''}{weeklyAnalytics.sessionsLogged} sessions this week.
            </p>
          </section>
        </>
      )}

      {activeSubTab === 'plan' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="Active program" title={planState.programLabel || 'Training program'} />
            <p className="empty-message">{planState.phase.theme}</p>
            <div className="tag-row">
              <span className="status-chip is-active">{planState.weekType} week</span>
              <span className="status-chip is-active">{fitnessSettings.trainingDays}</span>
              <span className="status-chip is-active">{selectedTrainingDays} sessions</span>
            </div>
            <div className="ui-metrics-row">
              <MetricBlock value={programWeek} label="Current week" />
              <MetricBlock value={programPhase} label="Current phase" />
              <MetricBlock value={programCountdown ?? '—'} label="Race countdown" />
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Goal card" title="Race build" />
            <div className="summary-row">
              <div className="summary-tile">
                <span>Race</span>
                <strong>{fitnessSettings.raceName || 'Not set'}</strong>
              </div>
              <div className="summary-tile">
                <span>Countdown</span>
                <strong>{programCountdown === null ? 'Not set' : `${programCountdown} days`}</strong>
              </div>
              <div className="summary-tile">
                <span>Program week</span>
                <strong>{programWeek}</strong>
              </div>
            </div>
            <p className="empty-message">Set race info and training settings in Settings.</p>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Weekly schedule" title="Program week layout" />
            <div className="subtle-feed">
              {weeklySchedule.map(session => {
                const stationNames = getSessionStations(session).map(station => station.name).join(', ');
                const statusLabel = session.status === 'completed'
                  ? 'Completed'
                  : session.status === 'moved'
                    ? `Moved → ${session.movedToDate}`
                    : session.status === 'skipped'
                      ? 'Skipped'
                      : session.status === 'missed'
                        ? 'Missed'
                        : session.status === 'today'
                          ? 'Today'
                          : 'Planned';
                return (
                  <article key={`${session.title}-${session.dateKey}`} className="feed-card">
                    <strong>{session.dayLabel} · {session.label || session.title}</strong>
                    <p>{session.dateLabel} · {session.detail || session.title}{stationNames ? ` · ${stationNames}` : ''}</p>
                    <div className="tag-row" style={{ marginTop: '8px' }}>
                      <span className="status-pill">{statusLabel}</span>
                      {['planned', 'today', 'missed'].includes(session.status) && (
                        <>
                          <button type="button" className="status-chip" onClick={() => updateWeeklySessionStatus(session, 'completed')}>
                            Mark done
                          </button>
                          <button type="button" className="status-chip" onClick={() => updateWeeklySessionStatus(session, 'skipped')}>
                            Skip
                          </button>
                          <button
                            type="button"
                            className="status-chip"
                            onClick={() => moveWeeklySession(session, toDateKey(addDays(new Date(`${session.dateKey}T00:00:00`), 1)))}
                          >
                            Move +1d
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'library' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="HYROX stations" title="Race station overview" />
            <div className="subtle-feed">
              {stationList.map(station => (
                <ListRow key={station.key} variant="card" label={station.name} sub={`${station.raceDistance} ${station.unit} · ${station.category}`} />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Saved workouts" title="Completed sessions" />
            <div className="subtle-feed">
              {workouts.filter(workout => workout.status === 'completed').length > 0 ? (
                workouts.filter(workout => workout.status === 'completed').slice(0, 5).map(workout => {
                  const meta = getCurrentWorkoutType(workout);
                  const candidates = getSwapCandidates({ n: workout.name });
                  return (
                    <ListRow
                      key={workout.id}
                      variant="card"
                      label={workout.name}
                      sub={`${workout.programName || 'HYROX'} · ${workout.duration} min · ${meta}${candidates.length > 0 ? ` · swaps: ${candidates.slice(0, 2).join(', ')}` : ''}`}
                    />
                  );
                })
              ) : (
                <EmptyState title="No completed workouts yet" description="Finished sessions will appear here as you log them." />
              )}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'history' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="History" title="Lightweight and expandable" />
            <div className="ui-metrics-row">
              <MetricBlock value={workouts.length} label="Workouts" />
              <MetricBlock value={workouts.filter(workout => getCurrentWorkoutType(workout) === 'running').length} label="Runs" />
              <MetricBlock value={workouts.filter(workout => ['strength', 'hyrox', 'hybrid'].includes(getCurrentWorkoutType(workout))).length} label="Strength" />
              <MetricBlock value={workouts.filter(workout => getCurrentWorkoutType(workout) === 'recovery').length} label="Recovery" />
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Workouts" title="Session history" />
            <div className="subtle-feed">
              {workouts.slice(0, 4).map(workout => (
                <ListRow key={workout.id} variant="card" label={workout.name} sub={`${workout.duration} min · ${workout.status}`} />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Notes" title="Quick log entry" />
            <div className="subtle-feed">
              {notes.slice(0, 3).map(note => (
                <ListRow key={note.id} variant="card" label={note.content} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MoreScreen({ initialSection = 'tasks', onSwitchToTab, now }) {
  const { profile, setProfile } = useProfileContext();
  const { workouts, inboxItems, setInboxItems } = useTaskContext();
  const { energyState, recoveryInputs, setRecoveryInputs, hubInsights, setHubInsights } = useAppContext();
  const [activeSection, setActiveSection] = useState(initialSection);
  const [insightDraft, setInsightDraft] = useState('');

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

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
    settings: 'App preferences and training configuration.',
    inbox: 'Capture and route incoming items.',
  };

  return (
    <div className="tab-stack">
      <Card>
        <SectionHeader eyebrow="More" title="Secondary workspaces" />
        <p className="empty-message">Today, Calendar, and Fitness stay in the primary nav. Everything else lives here.</p>
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

      {activeSection === 'tasks' && <TasksScreen />}
      {activeSection === 'meals' && <NutritionScreen now={now || new Date()} />}
      {activeSection === 'finance' && <FinanceScreen />}
      {activeSection === 'recovery' && (
        <Card>
          <SectionHeader eyebrow="Recovery / Health" title="Downshift and restore" />
          <div className="subtle-feed">
            <div className="ui-metrics-row">
              <MetricBlock value={energyState.value} label="Energy" />
              <MetricBlock value={energyState.sleepHours} label="Sleep" />
              <MetricBlock value={recoveryInputs.preferredSession} label="Default recovery" />
            </div>
            {RECOVERY_SESSIONS.map(session => (
              <ListRow
                key={session.id}
                variant="card"
                label={session.name}
                sub={`${session.when} · ${session.dur}`}
                action={(
                  <button
                    type="button"
                    className="ghost-button compact-ghost"
                    onClick={() => setRecoveryInputs(current => ({ ...current, preferredSession: session.id }))}
                  >
                    Set default
                  </button>
                )}
              />
            ))}
          </div>
        </Card>
      )}
      {activeSection === 'lifestyle' && (
        <Card>
          <SectionHeader eyebrow="Lifestyle" title="Habits and daily notes" />
          <div className="subtle-feed">
            {profile.habits.length > 0 ? profile.habits.map(habit => (
              <ListRow key={habit.id} variant="card" label={habit.title || 'Habit'} sub={habit.frequency} />
            )) : (
              <EmptyState title="No habits yet" description="Use the lifestyle section to track repeated actions." />
            )}
          </div>
        </Card>
      )}
      {activeSection === 'maintenance' && (
        <Card>
          <SectionHeader eyebrow="Maintenance" title="Household and upkeep" />
          <HomeScreen />
        </Card>
      )}
      {activeSection === 'insights' && (
        <Card>
          <SectionHeader eyebrow="Insights" title="Weekly review" />
          <div className="subtle-feed">
            <div className="ui-metrics-row">
              <MetricBlock value={weeklyAnalytics.sessionsLogged} label="Sessions" />
              <MetricBlock value={weeklyAnalytics.runMiles} label="Run mi" />
              <MetricBlock value={weeklyAnalytics.totalMinutes} label="Minutes" />
            </div>
            <div className="field-stack">
              <textarea
                className="notes-textarea"
                value={insightDraft}
                onChange={event => setInsightDraft(event.target.value)}
                placeholder="Capture a weekly insight"
              />
              <button type="button" className="secondary-button" onClick={addInsightNote}>
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
      {activeSection === 'settings' && (
        <SettingsScreen />
      )}
      {activeSection === 'inbox' && (
        <Card>
          <SectionHeader eyebrow="Inbox" title="Capture and triage" />
          <div className="subtle-feed">
            <InboxScreen onSwitchToTab={onSwitchToTab} />
            {inboxItems.filter(item => item.module === null).slice(0, 4).map(item => (
              <ListRow
                key={item.id}
                variant="card"
                label={item.text}
                action={(
                  <button type="button" className="ghost-button compact-ghost" onClick={() => promoteInboxItem(item.id)}>
                    Promote
                  </button>
                )}
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <SectionHeader eyebrow="Quick" title="Shortcuts" />
        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={() => setActiveSection('tasks')}>
            Open tasks
          </button>
          <button type="button" className="secondary-button" onClick={() => setActiveSection('recovery')}>
            Open recovery
          </button>
          <button type="button" className="secondary-button" onClick={() => setActiveSection('inbox')}>
            Open inbox
          </button>
        </div>
      </Card>
    </div>
  );
}

function AppShell() {
  const {
    setNotifications,
    createNotification,
    createTask,
    createMeal,
    createNote,
    createWorkout,
    createExercise,
    notifications,
    calendarItems,
    setCalendarItems,
    setTasks,
    setMeals,
    setNotes,
    workouts,
    setWorkouts,
    inboxItems,
  } = useTaskContext();
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationCenterOpen,
    setNotificationCenterOpen,
    showMorningCheckin,
    setShowMorningCheckin,
    energyState,
    fitnessSettings,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState('today');
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [moreSection, setMoreSection] = useState('tasks');

  useEffect(() => {
    const lastCheckIn = energyState.lastCheckIn;
    const alreadyCheckedIn = lastCheckIn && sameDay(new Date(lastCheckIn), now);
    if (!alreadyCheckedIn && !showMorningCheckin) {
      setShowMorningCheckin(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter(notification => !notification.read),
    [notifications],
  );

  function markAllNotificationsRead() {
    setNotifications(current => current.map(notification => ({ ...notification, read: true })));
  }

  function openMoreSection(section) {
    setMoreSection(section);
    setActiveTab('more');
  }

  function openSettingsPage() {
    setMoreSection('settings');
    setActiveTab('more');
  }

  function handleQuickAddSubmit(payload) {
    const { type, title, notes, tags, duration, content } = payload;

    if (type === 'task') {
      setTasks(current => [createTask({ title, notes, status: 'active', priority: true }), ...current]);
      setNotifications(current => [createNotification({ title: 'Task captured', detail: title }), ...current]);
      return;
    }

    if (type === 'meal') {
      setMeals(current => [createMeal({ name: title, tags }), ...current]);
      setNotifications(current => [createNotification({ title: 'Meal captured', detail: title }), ...current]);
      return;
    }

    if (type === 'workout') {
      setWorkouts(current => [createWorkout({ name: title, duration: Number.isFinite(duration) ? duration : 30, status: 'planned', exercises: [createExercise({ name: 'Warm-up', detail: '5 min mobility' }), createExercise({ name: 'Main set', detail: 'Start with intent' }), createExercise({ name: 'Cooldown', detail: 'Breathe and reset' })] }), ...current]);
      setNotifications(current => [createNotification({ title: 'Workout captured', detail: title }), ...current]);
      return;
    }

    setNotes(current => [createNote({ content: content || title || notes }), ...current]);
    setNotifications(current => [createNotification({ title: 'Note captured', detail: content || title || notes }), ...current]);
  }

  function startTodayWorkout(session) {
    const existingTodayWorkout = workouts.find(workout => workout.scheduledDate === toDateKey(now) && !['completed', 'skipped'].includes(workout.status));
    if (existingTodayWorkout) {
      const startedAt = Date.now();
      setWorkouts(current => current.map(workout => (
        workout.id === existingTodayWorkout.id
          ? { ...workout, status: 'active', startedAt }
          : workout.status === 'active'
            ? { ...workout, status: 'planned' }
            : workout
      )));
      setActiveWorkoutId(existingTodayWorkout.id);
      setActiveTab('fitness');
      return;
    }

    if (!session) {
      setActiveTab('fitness');
      return;
    }

    const sessionWorkout = createWorkoutFromSession({
      createWorkout,
      createExercise,
      session,
      settings: fitnessSettings,
      todayKey: toDateKey(now),
    });

    setWorkouts(current => [
      { ...sessionWorkout, status: 'active', startedAt: Date.now() },
      ...current.map(workout => (workout.status === 'active' ? { ...workout, status: 'planned' } : workout)),
    ]);
    setActiveWorkoutId(sessionWorkout.id);
    setActiveTab('fitness');
  }

  const primaryScreen = useMemo(() => {
    if (activeTab === 'calendar') {
      return <CalendarScreen />;
    }

    if (activeTab === 'nutrition') {
      return <NutritionScreen now={now} />;
    }

    if (activeTab === 'fitness') {
      return <FitnessScreen now={now} activeWorkoutId={activeWorkoutId} onStartWorkout={setActiveWorkoutId} />;
    }

    if (activeTab === 'more') {
      return <MoreScreen initialSection={moreSection} onSwitchToTab={setActiveTab} now={now} />;
    }

    return (
      <TodayScreen
        now={now}
        activeWorkoutId={activeWorkoutId}
        onSwitchToFitness={() => setActiveTab('fitness')}
        onOpenMoreSection={openMoreSection}
        onOpenInbox={() => openMoreSection('inbox')}
        onStartWorkout={startTodayWorkout}
      />
    );
  }, [activeTab, activeWorkoutId, moreSection, now, workouts, createWorkout, createExercise, fitnessSettings]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab !== 'more') return;
    setMoreSection(prev => prev || 'tasks');
  }

  function openQuickCapture() {
    setQuickAddOpen(true);
  }

  return (
    <>
      <AppFrame
        tabs={ROOT_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userName="Alex"
        inboxCount={unreadNotifications.length}
        onOpenInbox={() => setNotificationCenterOpen(true)}
        onOpenQuickAdd={openQuickCapture}
        onOpenSettings={openSettingsPage}
      >
        {primaryScreen}
      </AppFrame>

      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAddSubmit}
      />

      <InboxView
        isOpen={notificationCenterOpen}
        notifications={notifications}
        onClose={() => setNotificationCenterOpen(false)}
        onMarkAllRead={markAllNotificationsRead}
      />

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
