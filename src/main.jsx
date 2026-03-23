import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppFrame from './components/AppFrame.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import InboxView from './views/InboxView.jsx';
import FinanceScreen from './views/FinanceScreen.jsx';
import MorningCheckinModal from './components/MorningCheckinModal.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
import { ProfileProvider, useProfileContext } from './context/ProfileContext.jsx';
import { ALL_STATIONS, getPlanState, buildWeeklySchedule as hyroxBuildWeeklySchedule } from './data/hyroxPlan.js';
import { Card, SectionHeader, MetricBlock, ListRow, EmptyState, FloatingActionButton, ExpandablePanel } from './components/ui/index.js';
import './styles.css';

const QUICK_MEAL_TAGS = ['protein', 'carbs', 'veg', 'quick'];
const NUTRITION_SLOTS = [
  {
    id: 'breakfast',
    label: 'Breakfast',
    keywords: ['breakfast', 'brunch', 'oat', 'oats', 'egg', 'eggs', 'yogurt', 'smoothie', 'coffee'],
  },
  {
    id: 'lunch',
    label: 'Lunch',
    keywords: ['lunch', 'sandwich', 'salad', 'wrap', 'bowl', 'rice', 'chicken'],
  },
  {
    id: 'dinner',
    label: 'Dinner',
    keywords: ['dinner', 'supper', 'pasta', 'salmon', 'steak', 'curry', 'taco'],
  },
  {
    id: 'snacks',
    label: 'Snacks',
    keywords: ['snack', 'snacks', 'bar', 'fruit', 'protein', 'bite', 'nuts'],
  },
];
const ROOT_TABS = [
  {
    id: 'home',
    label: 'Plan',
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
    id: 'finance',
    label: 'Finance',
    iconPath: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  },
];

const FITNESS_SUBTABS = [
  { id: 'today', label: 'Today' },
  { id: 'plan', label: 'Plan' },
  { id: 'library', label: 'Workout Library' },
  { id: 'logging', label: 'Logging' },
];

const FITNESS_FREQUENCIES = ['4-day', '5-day'];
const WEEKDAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function inferWorkoutProgram(workout) {
  const rawType = typeof workout?.type === 'string' ? workout.type.toLowerCase() : '';
  const rawName = `${workout?.programName || workout?.name || ''}`.toLowerCase();

  if (['hyrox', 'strength', 'running', 'pilates', 'recovery'].includes(rawType)) return rawType;
  if (rawName.includes('hyrox')) return 'hyrox';
  if (rawName.includes('pilates')) return 'pilates';
  if (rawName.includes('recover') || rawName.includes('mobility') || rawName.includes('stretch')) return 'recovery';
  if (rawName.includes('run')) return 'running';
  return 'strength';
}

function alignDateToAnchor(date, anchorDay) {
  const base = startOfDay(date);
  const targetIndex = WEEKDAY_INDEX[anchorDay] ?? 1;
  const currentIndex = base.getDay();
  const delta = (currentIndex - targetIndex + 7) % 7;
  return addDays(base, -delta);
}

function formatCountdown(targetDate, now = new Date()) {
  const ms = startOfDay(targetDate).getTime() - startOfDay(now).getTime();
  const days = Math.max(0, Math.round(ms / 86_400_000));

  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

function getWorkoutProgramKey(workout) {
  return inferWorkoutProgram(workout);
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
  const selectedCurrent = currentWeek.filter(workout => getWorkoutProgramKey(workout) === programType);

  const milesCompleted = completedCurrent.reduce((total, workout) => total + (Number.isFinite(workout.distanceMiles) ? workout.distanceMiles : 0), 0);
  const strengthSessions = completedCurrent.filter(workout => ['strength', 'hyrox'].includes(getWorkoutProgramKey(workout))).length;
  const recoverySessions = completedCurrent.filter(workout => ['recovery', 'pilates'].includes(getWorkoutProgramKey(workout))).length;
  const workoutsCompleted = completedCurrent.length;
  const workoutTrend = workoutsCompleted - completedPrevious.length;

  return {
    workoutsCompleted,
    milesCompleted,
    strengthSessions,
    recoverySessions,
    workoutTrend,
    currentWeekWorkouts: selectedCurrent,
  };
}


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

function startOfMonth(value) {
  const date = new Date(value);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isWithinRange(value, start, end) {
  const date = new Date(value);
  return date >= start && date < end;
}

function toDateKey(value) {
  return startOfDay(value).toISOString().slice(0, 10);
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function sameDay(left, right) {
  return toDateKey(left) === toDateKey(right);
}

function normalizeMealTags(tags = []) {
  return Array.from(new Set(tags.filter(tag => typeof tag === 'string' && tag.trim())));
}

function getMealSlotFromTags(meal) {
  const slotTag = meal?.tags?.find(tag => typeof tag === 'string' && tag.startsWith('slot:'));
  if (slotTag) {
    const slot = slotTag.slice(5);
    if (NUTRITION_SLOTS.some(item => item.id === slot)) return slot;
  }

  return null;
}

function inferMealSlot(meal) {
  const explicitSlot = getMealSlotFromTags(meal);
  if (explicitSlot) return explicitSlot;

  const haystack = `${meal?.name || ''} ${Array.isArray(meal?.tags) ? meal.tags.join(' ') : ''}`.toLowerCase();
  const matchedSlot = NUTRITION_SLOTS.find(slot => slot.keywords.some(keyword => haystack.includes(keyword)));
  if (matchedSlot) return matchedSlot.id;

  const hour = new Date(meal?.loggedAt || Date.now()).getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
  return 'snacks';
}

function isPlannedMeal(meal) {
  return Array.isArray(meal?.tags) && meal.tags.includes('planned');
}

function isHydrationMeal(meal) {
  return Array.isArray(meal?.tags) && meal.tags.includes('water');
}

function getMealTimeLabel(meal) {
  return formatShortTime(meal.loggedAt);
}

function getGreeting(now = new Date()) {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function createCalendarSeed() {
  const now = new Date();
  return [
    {
      id: 'calendar-1',
      type: 'busy',
      title: 'Deep work block',
      date: toDateKey(now),
      startTime: '09:00',
      endTime: '11:00',
      repeatWeekly: true,
      priority: true,
    },
    {
      id: 'calendar-2',
      type: 'event',
      title: 'Lunch check-in',
      date: toDateKey(now),
      startTime: '12:30',
      endTime: '13:00',
      notes: '',
      repeatWeekly: false,
      priority: false,
    },
    {
      id: 'calendar-3',
      type: 'task',
      taskId: 'task-priority',
      title: 'Clear follow-ups',
      date: toDateKey(addDays(now, 1)),
      startTime: '16:00',
      endTime: '16:30',
      priority: true,
    },
  ];
}

function InlineTaskComposer({ defaultPriority, onSubmit }) {
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setTitle('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setTitle('');
      inputRef.current?.blur();
    }
  }

  return (
    <form className="inline-task-form" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="task-title-input"
        value={title}
        onChange={event => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={defaultPriority ? 'Add a priority task…' : 'Add a task…'}
        aria-label="Add a task"
      />
      {title.trim() && (
        <button type="submit" className="primary-button compact-primary">
          Add
        </button>
      )}
    </form>
  );
}

const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'];
const RACE_CATEGORIES = ['Open', 'Pro', 'Masters'];
const ALL_STATION_KEYS = Object.values(ALL_STATIONS).map(s => s.key);
const ALL_STATION_NAMES = Object.values(ALL_STATIONS).map(s => s.name);

function SettingsSheet({ isOpen, onClose }) {
  const {
    fitnessSettings, setFitnessSettings,
    workCalendarPrefs, setWorkCalendarPrefs,
    mealPrefs, setMealPrefs,
    notificationPrefs, setNotificationPrefs,
  } = useAppContext();
  const { profile, updateAthlete } = useProfileContext();

  const [draft, setDraft] = useState(() => ({ ...fitnessSettings }));
  const [athleteDraft, setAthleteDraft] = useState(() => ({ ...profile.athlete }));

  useEffect(() => {
    if (isOpen) {
      setDraft({ ...fitnessSettings });
      setAthleteDraft({ ...profile.athlete });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const raceCountdown = useMemo(() => {
    if (!draft.raceDate) return null;
    const target = new Date(`${draft.raceDate}T00:00:00`);
    const now = new Date();
    const days = Math.round((target - now) / 86_400_000);
    if (days < 0) return `${Math.abs(days)} days ago`;
    if (days === 0) return 'Today';
    return `${days} days away`;
  }, [draft.raceDate]);

  if (!isOpen) return null;

  function save() {
    setFitnessSettings(current => ({ ...current, ...draft }));
    updateAthlete(athleteDraft);
    onClose();
  }

  function patch(key, value) {
    setDraft(d => ({ ...d, [key]: value }));
  }

  function patchAthlete(key, value) {
    setAthleteDraft(d => ({ ...d, [key]: value }));
  }

  function toggleStation(key) {
    setDraft(d => {
      const current = Array.isArray(d.weakStations) ? d.weakStations : [];
      return {
        ...d,
        weakStations: current.includes(key)
          ? current.filter(k => k !== key)
          : [...current, key],
      };
    });
  }

  const stationList = Object.values(ALL_STATIONS);
  const weakStations = Array.isArray(draft.weakStations) ? draft.weakStations : [];

  function handleExportData() {
    const exportKeys = [
      'purple-waffle-app-state',
      'purple-waffle-profile',
      'purple-waffle-dashboard-v2',
      'aiml-morning-checklist',
    ];
    const exported = {};
    for (const key of exportKeys) {
      try {
        const raw = window.localStorage.getItem(key);
        exported[key] = raw ? JSON.parse(raw) : null;
      } catch {
        exported[key] = null;
      }
    }
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purple-waffle-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function getStorageInfo() {
    const keys = [
      'purple-waffle-app-state',
      'purple-waffle-profile',
      'purple-waffle-dashboard-v2',
      'aiml-morning-checklist',
    ];
    return keys.map(key => {
      const raw = window.localStorage.getItem(key);
      const bytes = raw ? new Blob([raw]).size : 0;
      return { key, size: bytes > 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B` };
    });
  }

  const storageInfo = getStorageInfo();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card settings-sheet" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Configuration</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-stack">

          {/* 1. Work Calendar */}
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
              <p className="empty-message">Calendar blocking and availability are managed in the Calendar tab.</p>
            </div>
          </ExpandablePanel>

          {/* 2. Finance */}
          <ExpandablePanel header={<strong>Finance</strong>}>
            <div className="field-stack">
              <p className="empty-message">Transactions and recurring expenses are logged in the Finance tab. Budget targets will be configurable in a future update.</p>
            </div>
          </ExpandablePanel>

          {/* 3. Google Integration */}
          <ExpandablePanel header={<strong>Google Integration</strong>}>
            <div className="field-stack">
              <ListRow variant="card" label="Google Calendar" sub="Not connected" />
              <button type="button" className="secondary-button" disabled>
                Connect Google — coming soon
              </button>
              <p className="empty-message">OAuth sync will pull calendar events and busy blocks automatically once connected.</p>
            </div>
          </ExpandablePanel>

          {/* 4. Fitness Profile */}
          <ExpandablePanel header={<strong>Fitness Profile</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field">
                <span>Training days</span>
                <div className="segmented-control">
                  {FITNESS_FREQUENCIES.map(freq => (
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
                <span>Program start date</span>
                <input
                  type="date"
                  className="task-title-input"
                  value={draft.programStartDate ?? ''}
                  onChange={e => patch('programStartDate', e.target.value || new Date().toISOString().slice(0, 10))}
                />
              </label>
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
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field-stack compact-field">
                <span>Equipment access</span>
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
              <label className="field-stack compact-field">
                <span>Current weekly mileage (km)</span>
                <input
                  type="number"
                  className="task-title-input"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 20"
                  value={draft.currentWeeklyMileage ?? ''}
                  onChange={e => patch('currentWeeklyMileage', e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
              <label className="field-stack compact-field">
                <span>Weak stations</span>
                <div className="tag-row">
                  {stationList.map(station => (
                    <button
                      key={station.key}
                      type="button"
                      className={`status-chip ${weakStations.includes(station.key) ? 'is-active' : ''}`}
                      onClick={() => toggleStation(station.key)}
                    >
                      {station.name}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field-stack compact-field">
                <span>Injuries or limitations</span>
                <textarea
                  className="task-title-input"
                  rows={3}
                  placeholder="Any injuries or movement limitations"
                  value={draft.injuriesOrLimitations ?? ''}
                  onChange={e => patch('injuriesOrLimitations', e.target.value)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>5K time</span>
                <input
                  type="text"
                  className="task-title-input"
                  placeholder="e.g. 22:30"
                  value={athleteDraft.fiveKTime ?? ''}
                  onChange={e => patchAthlete('fiveKTime', e.target.value || null)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>HYROX finish time (personal best)</span>
                <input
                  type="text"
                  className="task-title-input"
                  placeholder="e.g. 1:12:00"
                  value={athleteDraft.hyroxFinishTime ?? ''}
                  onChange={e => patchAthlete('hyroxFinishTime', e.target.value || null)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>Squat 5RM (kg)</span>
                <input
                  type="number"
                  className="task-title-input"
                  placeholder="e.g. 100"
                  value={athleteDraft.squat5RM ?? ''}
                  onChange={e => patchAthlete('squat5RM', e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>Deadlift 5RM (kg)</span>
                <input
                  type="number"
                  className="task-title-input"
                  placeholder="e.g. 140"
                  value={athleteDraft.deadlift5RM ?? ''}
                  onChange={e => patchAthlete('deadlift5RM', e.target.value ? Number(e.target.value) : null)}
                />
              </label>
              <div className="field-stack compact-field">
                <span>Body weight</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="task-title-input"
                    style={{ flex: 1 }}
                    min="0"
                    step="0.1"
                    placeholder="e.g. 75"
                    value={athleteDraft.bodyWeight ?? ''}
                    onChange={e => patchAthlete('bodyWeight', e.target.value === '' ? null : Number(e.target.value))}
                  />
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
                </div>
              </div>
              <label className="field-stack compact-field">
                <span>Age</span>
                <input
                  type="number"
                  className="task-title-input"
                  min="1"
                  max="120"
                  placeholder="e.g. 32"
                  value={athleteDraft.age ?? ''}
                  onChange={e => patchAthlete('age', e.target.value === '' ? null : Number(e.target.value))}
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
            </div>
          </ExpandablePanel>

          {/* 5. Goals and Targets */}
          <ExpandablePanel header={<strong>Goals and Targets</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field">
                <span>Race date</span>
                <input
                  type="date"
                  className="task-title-input"
                  value={draft.raceDate ?? ''}
                  onChange={e => patch('raceDate', e.target.value || null)}
                />
              </label>
              {raceCountdown && (
                <p className="empty-message">Countdown: {raceCountdown}</p>
              )}
              <label className="field-stack compact-field">
                <span>Race name</span>
                <input
                  type="text"
                  className="task-title-input"
                  placeholder="e.g. HYROX London"
                  value={draft.raceName ?? ''}
                  onChange={e => patch('raceName', e.target.value)}
                />
              </label>
              <label className="field-stack compact-field">
                <span>Category</span>
                <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
                  {RACE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`status-chip ${draft.raceCategory === cat ? 'is-active' : ''}`}
                      onClick={() => patch('raceCategory', cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </label>
              <label className="field-stack compact-field">
                <span>Goal finish time</span>
                <input
                  type="text"
                  className="task-title-input"
                  placeholder="e.g. 1:05:00"
                  value={draft.goalFinishTime ?? ''}
                  onChange={e => patch('goalFinishTime', e.target.value)}
                />
              </label>
            </div>
          </ExpandablePanel>

          {/* 6. Meal Preferences */}
          <ExpandablePanel header={<strong>Meal Preferences</strong>}>
            <div className="field-stack">
              <label className="field-stack compact-field">
                <span>Daily hydration goal (cups)</span>
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
                  placeholder="e.g. No gluten, high protein"
                  value={mealPrefs.dietaryNotes}
                  onChange={e => setMealPrefs(p => ({ ...p, dietaryNotes: e.target.value }))}
                />
              </label>
            </div>
          </ExpandablePanel>

          {/* 7. Notifications */}
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
              <p className="empty-message">Notifications are in-app only. Push notification support is not yet available.</p>
            </div>
          </ExpandablePanel>

          {/* 8. Security & Data */}
          <ExpandablePanel header={<strong>Security &amp; Data</strong>}>
            <div className="field-stack">
              <SectionHeader eyebrow="Local storage" title="Data stored on this device" />
              <div className="subtle-feed">
                {storageInfo.map(({ key, size }) => (
                  <ListRow key={key} variant="card" label={key} sub={size} />
                ))}
              </div>
              <button type="button" className="secondary-button" onClick={handleExportData}>
                Export all data (JSON)
              </button>
              <p className="empty-message">Data is stored locally in your browser. No cloud backup. Export regularly to avoid data loss.</p>
            </div>
          </ExpandablePanel>

        </div>

        <div className="inline-actions" style={{ padding: '1rem' }}>
          <button type="button" className="primary-button" onClick={save}>
            Save settings
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

function DashboardScreen({ inboxCount, now, activeWorkoutId, onStartWorkout, onSwitchToFitness, weeklyItems }) {
  const { tasks, setTasks, notes, workouts, createTask, createSubtask, habits, setHabits } = useTaskContext();
  const { energyState, setQuickAddOpen, fitnessSettings } = useAppContext();

  const [executionExpanded, setExecutionExpanded] = useState(true);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [priorityMode, setPriorityMode] = useState(true);
  const [showCompleteAllConfirm, setShowCompleteAllConfirm] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const dragStateRef = useRef({
    taskId: null,
    pointerId: null,
    timer: null,
    startX: 0,
    startY: 0,
    active: false,
  });

  const todayKey = toDateKey(now);
  const todayStr = now.toISOString().slice(0, 10);

  const orderedTasks = useMemo(() => {
    const rank = { active: 0, planned: 1, done: 2 };
    return [...tasks].sort((a, b) => rank[a.status] - rank[b.status]);
  }, [tasks]);

  const activeWorkout = useMemo(() => {
    if (!activeWorkoutId) return null;
    return workouts.find(w => w.id === activeWorkoutId) ?? null;
  }, [activeWorkoutId, workouts]);

  const todayHabits = useMemo(
    () => habits.filter(h => h.frequency === 'daily' || h.frequency === 'weekly'),
    [habits],
  );

  const planState = useMemo(
    () => getPlanState({ startDate: fitnessSettings.programStartDate, trainingDays: fitnessSettings.trainingDays }),
    [fitnessSettings.programStartDate, fitnessSettings.trainingDays],
  );

  const todaySession = useMemo(
    () => planState.sessions.find(s => toDateKey(s.date) === todayKey) ?? null,
    [planState.sessions, todayKey],
  );

  const visibleExecutionTasks = executionExpanded ? orderedTasks : orderedTasks.slice(0, 3);
  const executionOverflowCount = Math.max(0, orderedTasks.length - visibleExecutionTasks.length);
  const todayAgendaGroups = useMemo(() => {
    const busyBlocks = weeklyItems
      .filter(item => item.date === todayKey && item.type === 'busy')
      .map(item => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.startTime} - ${item.endTime}`,
      }));

    const workoutItems = workouts.map(workout => ({
      id: workout.id,
      title: workout.name,
      subtitle: `${workout.duration} min · ${workout.status}`,
    }));

    const taskItems = orderedTasks
      .filter(task => task.status !== 'done')
      .filter(task => (priorityMode ? task.priority : true))
      .map(task => ({
        id: task.id,
        title: task.title || 'Untitled task',
        subtitle: `${task.status}${task.priority ? ' · priority' : ''}`,
      }));

    const noteItems = notes.slice(0, 4).map(note => ({
      id: note.id,
      title: note.content || 'Note',
      subtitle: note.createdAt ? formatShortMonthDay(note.createdAt) : 'Saved note',
    }));

    return [
      { key: 'busy', label: 'Busy blocks', items: busyBlocks },
      { key: 'workouts', label: 'Workouts', items: workoutItems },
      { key: 'tasks', label: 'Tasks', items: taskItems },
      { key: 'notes', label: 'Notes', items: noteItems },
    ];
  }, [notes, orderedTasks, priorityMode, todayKey, weeklyItems, workouts]);

  useEffect(() => {
    return () => {
      if (dragStateRef.current.timer) {
        window.clearTimeout(dragStateRef.current.timer);
      }
    };
  }, []);

  function preserveScroll(runUpdate) {
    const container = document.querySelector('.app-content');
    const top = container?.scrollTop ?? null;
    runUpdate();
    if (container && top !== null) {
      window.requestAnimationFrame(() => { container.scrollTop = top; });
    }
  }

  function updateTask(taskId, updates) {
    setTasks(current => current.map(t => (t.id === taskId ? { ...t, ...updates } : t)));
  }

  function deleteTask(taskId) {
    setTasks(current => current.filter(t => t.id !== taskId));
  }

  function toggleTaskDone(taskId) {
    setTasks(current => current.map(t => (
      t.id === taskId ? { ...t, status: t.status === 'done' ? 'active' : 'done' } : t
    )));
  }

  function setTaskStatus(taskId, status) {
    updateTask(taskId, { status });
  }

  function toggleSubtask(taskId, subtaskId) {
    setTasks(current => current.map(t => (
      t.id === taskId
        ? { ...t, subtasks: t.subtasks.map(st => (st.id === subtaskId ? { ...st, done: !st.done } : st)) }
        : t
    )));
  }

  function addSubtask(taskId) {
    setTasks(current => current.map(t => (
      t.id === taskId ? { ...t, subtasks: [...t.subtasks, createSubtask('')] } : t
    )));
  }

  function addInlineTask(title) {
    const taskTitle = title.trim();
    if (!taskTitle) return;
    setTasks(current => [createTask({ status: 'active', title: taskTitle, priority: priorityMode }), ...current]);
  }

  function completeAllTasks() {
    setTasks(current => current.map(t => (t.status !== 'done' ? { ...t, status: 'done' } : t)));
    setShowCompleteAllConfirm(false);
  }

  function toggleHabit(habitId) {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const hasToday = h.completedDates.includes(todayStr);
      return {
        ...h,
        completedDates: hasToday
          ? h.completedDates.filter(d => d !== todayStr)
          : [...h.completedDates, todayStr],
      };
    }));
  }

  function reorderTask(taskId, targetId, placement = 'before') {
    preserveScroll(() => {
      setTasks(current => {
        const fromIndex = current.findIndex(t => t.id === taskId);
        const targetIndex = current.findIndex(t => t.id === targetId);
        if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return current;
        const next = [...current];
        const [item] = next.splice(fromIndex, 1);
        let insertAt = next.findIndex(t => t.id === targetId);
        if (insertAt < 0) insertAt = next.length;
        if (placement === 'after') insertAt += 1;
        next.splice(insertAt, 0, item);
        return next;
      });
    });
  }

  function startTaskDrag(taskId, event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (dragStateRef.current.timer) window.clearTimeout(dragStateRef.current.timer);
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    dragStateRef.current = {
      taskId,
      pointerId,
      timer: window.setTimeout(() => {
        setDraggingTaskId(taskId);
        dragStateRef.current.active = true;
        handle.setPointerCapture?.(pointerId);
      }, 180),
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }

  function moveTaskDrag(taskId, event) {
    const dragState = dragStateRef.current;
    if (dragState.taskId !== taskId) return;
    const deltaX = Math.abs(event.clientX - dragState.startX);
    const deltaY = Math.abs(event.clientY - dragState.startY);
    if (!dragState.active) {
      if (deltaX > 8 || deltaY > 8) {
        if (dragState.timer) { window.clearTimeout(dragState.timer); dragState.timer = null; }
      }
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-task-id]');
    const targetId = target?.getAttribute('data-task-id');
    if (!targetId || targetId === taskId) return;
    const targetRect = target.getBoundingClientRect();
    const placement = event.clientY > targetRect.top + (targetRect.height / 2) ? 'after' : 'before';
    reorderTask(taskId, targetId, placement);
  }

  function endTaskDrag(taskId) {
    const dragState = dragStateRef.current;
    if (dragState.taskId !== taskId) return;
    if (dragState.timer) window.clearTimeout(dragState.timer);
    dragStateRef.current = { taskId: null, pointerId: null, timer: null, startX: 0, startY: 0, active: false };
    setDraggingTaskId(current => (current === taskId ? null : current));
  }

  return (
    <div className="tab-stack">
      <section className="task-card today-surface">
            {/* Date + greeting */}
            <div className="today-zone">
              <p className="eyebrow">{formatFullDate(now)}</p>
              <h2>{getGreeting(now)}</h2>
            </div>

            {/* Today's agenda */}
            <div className="today-zone">
              <ExpandablePanel
                defaultOpen
                header={<p className="eyebrow" style={{ margin: 0 }}>Today&apos;s agenda</p>}
              >
                <div className="subtle-feed agenda-groups" style={{ paddingTop: 8 }}>
                  {todayAgendaGroups.map(group => {
                    const visibleItems = agendaExpanded ? group.items : group.items.slice(0, 3);
                    const overflowCount = Math.max(0, group.items.length - visibleItems.length);
                    return (
                      <article key={group.key} className="feed-card agenda-group">
                        <div className="agenda-group-header">
                          <strong>{group.label}</strong>
                          <span>{group.items.length}</span>
                        </div>
                        <div className="agenda-group-list">
                          {visibleItems.length === 0 ? (
                            <p className="empty-message">None</p>
                          ) : (
                            visibleItems.map(item => (
                              <div key={item.id} className="agenda-item">
                                <strong>{item.title}</strong>
                                <span>{item.subtitle}</span>
                              </div>
                            ))
                          )}
                          {!agendaExpanded && overflowCount > 0 && (
                            <button type="button" className="agenda-overflow" onClick={() => setAgendaExpanded(true)}>
                              + {overflowCount} more
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </ExpandablePanel>
            </div>

            {/* Fitness state */}
            <div className="today-zone">
              {activeWorkout ? (
                <button type="button" className="active-workout-banner" onClick={onSwitchToFitness}>
                  <span>{activeWorkout.name} in progress</span>
                  <span className="active-workout-banner-cta">Tap to return →</span>
                </button>
              ) : (
                <article className="contextual-card">
                  <div className="contextual-card-header">
                    <p className="contextual-card-eyebrow">Fitness · {planState.label}</p>
                    <button type="button" className="ghost-button compact-ghost" onClick={onSwitchToFitness}>
                      Details
                    </button>
                  </div>
                  {todaySession ? (
                    <>
                      <strong className="contextual-card-title">{todaySession.title}</strong>
                      <p className="contextual-card-subtitle">{todaySession.detail}</p>
                      {todaySession.stations.length > 0 && (
                        <p className="contextual-card-subtitle">{todaySession.stations.map(s => s.name).join(' · ')}</p>
                      )}
                    </>
                  ) : (
                    <strong className="contextual-card-title">Rest day</strong>
                  )}
                </article>
              )}
            </div>

            {/* Top tasks execution list */}
            <div className="today-zone today-zone-execution">
              <div className="task-card-header">
                <p className="eyebrow">Top tasks</p>
                <div className="header-stack">
                  <button type="button" className="ghost-button compact-ghost" onClick={() => setPriorityMode(current => !current)}>
                    {priorityMode ? 'Priority mode' : 'All tasks'}
                  </button>
                  <button type="button" className="ghost-button compact-ghost" onClick={() => setExecutionExpanded(current => !current)}>
                    {executionExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>
              </div>
              <div className="execution-list">
                <InlineTaskComposer defaultPriority={priorityMode} onSubmit={addInlineTask} />
                {orderedTasks.length === 0 ? (
                  <EmptyState title="No tasks yet" description="Capture one inline and keep moving." />
                ) : (
                  visibleExecutionTasks.map(task => (
                    <ExecutionTaskItem
                      key={task.id}
                      task={task}
                      onUpdateTask={updateTask}
                      onDeleteTask={deleteTask}
                      onToggleDone={toggleTaskDone}
                      onToggleSubtask={toggleSubtask}
                      onAddSubtask={addSubtask}
                      onSetStatus={setTaskStatus}
                      onStartDrag={startTaskDrag}
                      onMoveDrag={moveTaskDrag}
                      onEndDrag={endTaskDrag}
                      isDragging={draggingTaskId === task.id}
                    />
                  ))
                )}
                {!executionExpanded && executionOverflowCount > 0 && (
                  <button type="button" className="execution-overflow" onClick={() => setExecutionExpanded(true)}>
                    + {executionOverflowCount} more
                  </button>
                )}
              </div>
            </div>

            {/* Habits tap-row */}
            {todayHabits.length > 0 && (
              <div className="today-zone">
                <p className="eyebrow" style={{ margin: '0 0 8px' }}>Habits</p>
                <div className="habit-tap-row">
                  {todayHabits.map(habit => {
                    const doneToday = habit.completedDates.includes(todayStr);
                    return (
                      <button
                        key={habit.id}
                        type="button"
                        className={`habit-tap${doneToday ? ' is-done' : ''}`}
                        onClick={() => toggleHabit(habit.id)}
                      >
                        {doneToday && (
                          <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ marginRight: 4 }}>
                            <polyline points="1,6 4,10 11,2" />
                          </svg>
                        )}
                        {habit.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recovery & signals */}
            <div className="today-zone">
              <ExpandablePanel
                defaultOpen={false}
                header={<p className="eyebrow" style={{ margin: 0 }}>Recovery &amp; signals</p>}
              >
                <div className="ui-metrics-row" style={{ paddingTop: 8 }}>
                  <MetricBlock value={energyState.value != null ? `${energyState.value}/5` : '—'} label="Energy" />
                  <MetricBlock value={energyState.sleepHours != null ? `${energyState.sleepHours}h` : '—'} label="Sleep" />
                  <MetricBlock value={inboxCount > 0 ? inboxCount : '—'} label="Inbox" />
                </div>
              </ExpandablePanel>
            </div>
          </section>

          {/* Today toolbar */}
          <div className="dashboard-toolbar">
            {showCompleteAllConfirm ? (
              <button type="button" className="ghost-button compact-ghost dashboard-toolbar-danger" onClick={completeAllTasks}>
                Confirm complete all
              </button>
            ) : (
              <button type="button" className="ghost-button compact-ghost" onClick={() => setShowCompleteAllConfirm(true)}>
                Complete All
              </button>
            )}
            <button type="button" className="ghost-button compact-ghost" onClick={() => setQuickAddOpen(true)}>
              Capture
            </button>
          </div>

    </div>
  );
}

function CalendarScreen({ weeklyItems, setWeeklyItems }) {
  const { tasks, meals, workouts } = useTaskContext();
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [draftBusyTitle, setDraftBusyTitle] = useState('');
  const [draftEventTitle, setDraftEventTitle] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('10:00');
  const [patternOpen, setPatternOpen] = useState(false);
  const [savedPattern, setSavedPattern] = useState([]);

  const weekDays = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(now, index);
      const key = toDateKey(day);
      return {
        key,
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        dateLabel: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: sameDay(day, now),
      };
    });
  }, []);

  useEffect(() => {
    if (!weekDays.some(day => day.key === selectedDate)) {
      setSelectedDate(toDateKey(new Date()));
    }
  }, [selectedDate, weekDays]);

  const selectedItems = useMemo(
    () => [
      ...(selectedDate === toDateKey(new Date())
        ? tasks.map(task => ({
            id: task.id,
            type: 'task',
            title: task.title || 'Untitled task',
            subtitle: `${task.status} task`,
          }))
        : []),
      ...meals
        .filter(meal => toDateKey(meal.loggedAt) === selectedDate)
        .map(meal => ({
          id: meal.id,
          type: 'meal',
          title: meal.name || 'Meal',
          subtitle: meal.tags.length ? meal.tags.join(' · ') : 'Logged today',
        })),
      ...workouts
        .filter(workout => workout.status === 'active' || sameDay(workout.createdAt, selectedDate))
        .map(workout => ({
          id: workout.id,
          type: 'workout',
          title: workout.name,
          subtitle: `${workout.duration} min · ${workout.status}`,
        })),
      ...weeklyItems
        .filter(item => item.date === selectedDate)
        .map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          subtitle: `${item.startTime} - ${item.endTime}`,
        })),
    ],
    [meals, selectedDate, tasks, weeklyItems, workouts],
  );

  const selectedDateLabel = useMemo(() => formatFullDate(selectedDate), [selectedDate]);

  function updateWeeklyItem(itemId, updates) {
    setWeeklyItems(current => current.map(item => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  function createScheduledItem(type) {
    const title = (type === 'busy' ? draftBusyTitle : draftEventTitle).trim();
    if (!title) return;

    const item = {
      id: `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      date: selectedDate,
      startTime: draftStartTime,
      endTime: draftEndTime,
      notes: type === 'event' ? '' : undefined,
      repeatWeekly: false,
      priority: false,
    };

    setWeeklyItems(current => [item, ...current]);

    if (type === 'busy') {
      setDraftBusyTitle('');
    } else {
      setDraftEventTitle('');
    }
  }

  const visiblePatternItems = useMemo(
    () => selectedItems,
    [selectedItems],
  );

  function savePattern() {
    setSavedPattern(selectedItems);
    setWeeklyItems(current =>
      current.map(item => (
        item.date === selectedDate ? { ...item, repeatWeekly: true } : item
      )),
    );
    setPatternOpen(true);
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>Weekly preview</h2>
          </div>
          <div className="calendar-nav">
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, -1)))}>
              Previous
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(new Date()))}>
              Today
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, 1)))}>
              Next
            </button>
          </div>
        </div>
        <div className="calendar-month-control">
          <strong>{selectedDateLabel}</strong>
          <p>Month/date control</p>
        </div>
      </section>

      <section className="task-card">
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
      </section>

      <section className="task-card calendar-detail-panel">
        <SectionHeader eyebrow="Selected day" title={selectedDateLabel} />
        <div className="action-row">
          <button type="button" className="secondary-button">Open daily</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('busy')}>Add busy</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('event')}>Add event</button>
        </div>
        <div className="subtle-feed">
          {selectedItems.length === 0 ? (
            <EmptyState title="No items scheduled" description="Add a busy block or event below." />
          ) : (
            selectedItems.map(item => (
              <ListRow key={item.id} variant="card" label={item.title} sub={item.subtitle || item.type} />
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <SectionHeader eyebrow="Add busy" title="Work time not tied to integrations" />
        <div className="calendar-form">
          <input
            className="task-title-input"
            value={draftBusyTitle}
            onChange={event => setDraftBusyTitle(event.target.value)}
            placeholder="Busy block title"
          />
          <div className="calendar-time-row">
            <input className="task-title-input" type="time" value={draftStartTime} onChange={event => setDraftStartTime(event.target.value)} />
            <input className="task-title-input" type="time" value={draftEndTime} onChange={event => setDraftEndTime(event.target.value)} />
          </div>
          <button type="button" className="primary-button" onClick={() => createScheduledItem('busy')}>Save busy block</button>
        </div>
      </section>

      <section className="task-card">
        <SectionHeader eyebrow="Add event" title="Manual event entry" />
        <div className="calendar-form">
          <input
            className="task-title-input"
            value={draftEventTitle}
            onChange={event => setDraftEventTitle(event.target.value)}
            placeholder="Event title"
          />
          <div className="calendar-time-row">
            <input className="task-title-input" type="time" value={draftStartTime} onChange={event => setDraftStartTime(event.target.value)} />
            <input className="task-title-input" type="time" value={draftEndTime} onChange={event => setDraftEndTime(event.target.value)} />
          </div>
          <button type="button" className="primary-button" onClick={() => createScheduledItem('event')}>Save event</button>
        </div>
      </section>

      <section className="task-card">
        <SectionHeader eyebrow="Schedule pattern" title="Save this schedule as a pattern" />
        <div className="subtle-feed">
          {visiblePatternItems.length === 0 ? (
            <EmptyState title="No visible pattern items" description="Selected-day items appear here before saving as a pattern." />
          ) : (
            visiblePatternItems.map(item => (
              <ListRow key={item.id} variant="card" label={item.title} sub={`${item.type} · weekly pattern ready`} />
            ))
          )}
        </div>
        <button type="button" className="secondary-button" onClick={savePattern}>Save this schedule as a pattern</button>
        {patternOpen && <p className="empty-message">Pattern saved locally for repeat weekly use. {savedPattern.length} items captured.</p>}
      </section>

      <section className="task-card">
        <SectionHeader eyebrow="Integration" title="Connect Google" />
        <p className="empty-message">Optional prompt only. Settings remains the place for integration setup.</p>
        <button type="button" className="ghost-button compact-ghost">Connect Google</button>
      </section>
    </div>
  );
}

function NutritionScreen({ now }) {
  const { meals, setMeals, createMeal, setNotifications, createNotification, pantryItems, setPantryItems } = useTaskContext();
  const [mealName, setMealName] = useState('');
  const [mealTags, setMealTags] = useState([]);
  const [mealSlot, setMealSlot] = useState('auto');
  const [planDrafts, setPlanDrafts] = useState(() => Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, ''])));
  const [pantryDraft, setPantryDraft] = useState('');
  const [prepNote, setPrepNote] = useState('');
  // selectedPlanDay controls which day the meal planning section edits (weekly planning)
  const [selectedPlanDay, setSelectedPlanDay] = useState(() => toDateKey(now));
  const todayKey = toDateKey(now);

  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );

  const todaysFuelMeals = useMemo(
    () => todaysMeals.filter(meal => !isHydrationMeal(meal)),
    [todaysMeals],
  );

  const hydrationCount = useMemo(
    () => todaysMeals.filter(isHydrationMeal).length,
    [todaysMeals],
  );

  const mealSlots = useMemo(() => {
    return NUTRITION_SLOTS.map(slot => {
      const slotMeals = todaysFuelMeals.filter(meal => inferMealSlot(meal) === slot.id);
      return {
        ...slot,
        planned: slotMeals.filter(isPlannedMeal),
        logged: slotMeals.filter(meal => !isPlannedMeal(meal)),
      };
    });
  }, [todaysFuelMeals]);

  const slotCoverage = useMemo(
    () => mealSlots.reduce(
      (accumulator, slot) => {
        accumulator.planned += slot.planned.length;
        accumulator.logged += slot.logged.length;
        return accumulator;
      },
      { planned: 0, logged: 0 },
    ),
    [mealSlots],
  );

  const macroSummary = useMemo(() => {
    const counts = { protein: 0, carbs: 0, veg: 0, quick: 0 };
    todaysFuelMeals.forEach(meal => {
      counts.protein += meal.tags.includes('protein') ? 1 : 0;
      counts.carbs += meal.tags.includes('carbs') ? 1 : 0;
      counts.veg += meal.tags.includes('veg') ? 1 : 0;
      counts.quick += meal.tags.includes('quick') ? 1 : 0;
    });
    return counts;
  }, [todaysFuelMeals]);

  const plannedEntries = useMemo(
    () => todaysFuelMeals.filter(isPlannedMeal),
    [todaysFuelMeals],
  );

  // Planned meals for the selected plan day (supports any day of the week)
  const planDayPlannedMeals = useMemo(
    () => meals.filter(meal => isPlannedMeal(meal) && !isHydrationMeal(meal) && toDateKey(meal.loggedAt) === selectedPlanDay),
    [meals, selectedPlanDay],
  );

  useEffect(() => {
    setPlanDrafts(() => {
      const next = Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, '']));
      NUTRITION_SLOTS.forEach(slot => {
        const plannedMeal = planDayPlannedMeals.find(meal => inferMealSlot(meal) === slot.id);
        if (plannedMeal) next[slot.id] = plannedMeal.name;
      });
      return next;
    });
  }, [planDayPlannedMeals, selectedPlanDay]);

  // Build a simple 7-day week strip anchored to Monday of this week
  const planWeekDays = useMemo(() => {
    const weekStart = alignDateToAnchor(now, 'Monday');
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return {
        key: toDateKey(d),
        label: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
      };
    });
  }, [now]);

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function submitMeal(slotOverride = mealSlot) {
    const trimmed = mealName.trim();
    if (!trimmed) return;

    const resolvedSlot = slotOverride === 'auto' ? inferMealSlot({ name: trimmed, tags: mealTags, loggedAt: Date.now() }) : slotOverride;
    const tags = normalizeMealTags([...mealTags, `slot:${resolvedSlot}`]);

    setMeals(current => [createMeal({ name: trimmed, tags }), ...current]);
    setMealName('');
    setMealTags([]);
    setMealSlot('auto');
    upsertNotification('Meal logged', `${trimmed} · ${NUTRITION_SLOTS.find(slot => slot.id === resolvedSlot)?.label || 'Auto'}`);
  }

  function logWater(amount = 1) {
    setMeals(current => [
      ...Array.from({ length: amount }, () => createMeal({ name: 'Water', tags: ['water'] })),
      ...current,
    ]);
    upsertNotification('Hydration updated', `${amount} glass${amount > 1 ? 'es' : ''} added`);
  }

  function savePlan() {
    // Use start-of-day timestamp for the selected plan day so meals are date-keyed correctly
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
      // Remove existing planned meals for the selected day's slots, keep everything else
      const withoutOldPlan = current.filter(meal => {
        if (toDateKey(meal.loggedAt) !== selectedPlanDay) return true;
        if (!isPlannedMeal(meal)) return true;
        return !NUTRITION_SLOTS.some(slot => inferMealSlot(meal) === slot.id);
      });
      return [...plannedMeals, ...withoutOldPlan];
    });

    const dayLabel = selectedPlanDay === todayKey ? 'Today' : new Date(`${selectedPlanDay}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    upsertNotification('Meal plan saved', `${dayLabel} plan updated`);
  }

  function savePantryItem() {
    const trimmed = pantryDraft.trim();
    if (!trimmed) return;

    setPantryItems(current => [trimmed, ...current]);
    setPantryDraft('');
  }

  function removePantryItem(item) {
    setPantryItems(current => current.filter(i => i !== item));
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
        <SectionHeader eyebrow="Nutrition" title="Today's fuel" />
        <div className="ui-metrics-row">
          <MetricBlock value={slotCoverage.planned} label="Planned" />
          <MetricBlock value={slotCoverage.logged} label="Logged" />
          <MetricBlock value={hydrationCount} label="Water" />
        </div>

        <div className="quick-entry-row">
          <input
            className="task-title-input"
            value={mealName}
            onChange={event => setMealName(event.target.value)}
            placeholder="Meal or snack"
          />
          <button type="button" className="primary-button" onClick={() => submitMeal()}>
            Log
          </button>
        </div>

        <div className="tag-row">
          <button
            type="button"
            className={`status-chip ${mealSlot === 'auto' ? 'is-active' : ''}`}
            onClick={() => setMealSlot('auto')}
          >
            Auto
          </button>
          {NUTRITION_SLOTS.map(slot => (
            <button
              key={slot.id}
              type="button"
              className={`status-chip ${mealSlot === slot.id ? 'is-active' : ''}`}
              onClick={() => {
                setMealSlot(slot.id);
                if (mealName.trim()) {
                  submitMeal(slot.id);
                }
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
              onClick={() => setMealTags(current => (
                current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]
              ))}
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
                    ? slot.logged.map(meal => `${meal.name} · ${getMealTimeLabel(meal)}`).join(' · ')
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
            <span style={{ width: `${Math.min(100, Math.round((hydrationCount / 8) * 100))}%` }} />
          </div>
          <p className="empty-message">Simple tap tracking. Goal: 8 cups.</p>
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
          title={selectedPlanDay === todayKey ? 'Today' : new Date(`${selectedPlanDay}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
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
          <input
            className="task-title-input"
            value={pantryDraft}
            onChange={event => setPantryDraft(event.target.value)}
            placeholder="Add pantry item"
          />
          <button type="button" className="ghost-button compact-ghost" onClick={savePantryItem}>
            Add
          </button>
        </div>

        <div className="tag-row">
          {pantryItems.map(item => (
            <span key={item} className="status-pill pantry-item">
              {item}
              <button
                type="button"
                className="pantry-remove"
                aria-label={`Remove ${item}`}
                onClick={() => removePantryItem(item)}
              >
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

        <label className="field-stack">
          <span>Prep note</span>
          <textarea
            className="notes-textarea"
            value={prepNote}
            onChange={event => setPrepNote(event.target.value)}
            placeholder="Prep work, grocery gaps, reminders"
          />
        </label>

        <div className="inline-actions">
          <button type="button" className="secondary-button" onClick={addPrepNote}>
            Save note
          </button>
          <p className="empty-message">Planned meals and hydration stay the focus; macros remain a light scaffold.</p>
        </div>
      </Card>
    </div>
  );
}

function FitnessScreen({ now, activeWorkoutId, onStartWorkout }) {
  const { workouts, notes, setWorkouts, setNotifications, createNotification, createWorkout, createExercise } = useTaskContext();
  const { energyState, setEnergyState, fitnessSettings, setFitnessSettings } = useAppContext();
  const [activeSubTab, setActiveSubTab] = useState('today');
  const [checkInDraft, setCheckInDraft] = useState(() => ({
    mood: energyState.mood || 'steady',
    energy: Number.isFinite(energyState.value) ? energyState.value : 3,
    sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
  }));
  const [acceptedRecovery, setAcceptedRecovery] = useState(false);
  const [acknowledgedMisses, setAcknowledgedMisses] = useState(() => new Set());

  // programStartDate comes directly from persisted fitnessSettings (migration guarantees valid string)
  const programStartDate = fitnessSettings.programStartDate;

  useEffect(() => {
    setCheckInDraft({
      mood: energyState.mood || 'steady',
      energy: Number.isFinite(energyState.value) ? energyState.value : 3,
      sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
    });
  }, [energyState.mood, energyState.value, energyState.sleepHours]);

  const activeWorkout = useMemo(
    () => workouts.find(workout => workout.id === activeWorkoutId) ?? null,
    [workouts, activeWorkoutId],
  );

  const todayKey = toDateKey(now);
  const planState = useMemo(
    () => getPlanState({ startDate: programStartDate, trainingDays: fitnessSettings.trainingDays }),
    [programStartDate, fitnessSettings.trainingDays],
  );
  const { week: programWeek, phase, sessions: weeklySchedule } = planState;
  const programPhase = phase.name;
  const weeklyStats = useMemo(() => getWorkoutStats(workouts, now, 'hyrox'), [workouts, now]);
  const programGoalDate = useMemo(() => {
    if (fitnessSettings.raceDate) return new Date(`${fitnessSettings.raceDate}T00:00:00`);
    return addDays(new Date(`${programStartDate}T00:00:00`), 224);
  }, [fitnessSettings.raceDate, programStartDate]);
  const programCountdown = programGoalDate ? formatCountdown(programGoalDate, now) : null;
  const stationList = useMemo(() => Object.values(ALL_STATIONS), []);
  const workoutLogs = useMemo(() => workouts.filter(workout => workout.status !== 'completed' || sameDay(workout.createdAt, now)), [workouts, now]);
  const runLogs = useMemo(() => workouts.filter(workout => getWorkoutProgramKey(workout) === 'running'), [workouts]);
  const strengthLogs = useMemo(() => workouts.filter(workout => getWorkoutProgramKey(workout) === 'strength' || getWorkoutProgramKey(workout) === 'hyrox'), [workouts]);
  const recoveryLogs = useMemo(() => workouts.filter(workout => getWorkoutProgramKey(workout) === 'recovery' || getWorkoutProgramKey(workout) === 'pilates'), [workouts]);
  const needsCheckIn = !energyState.lastCheckIn || !sameDay(energyState.lastCheckIn, now);
  const recoverySuggested =
    acceptedRecovery
      ? null
      : ((checkInDraft.energy <= 2 || checkInDraft.sleepHours <= 6 || ['flat', 'tired', 'low'].includes(checkInDraft.mood))
          ? {
              title: 'Recovery recommendation',
              detail: 'Low energy, short sleep, or a flat mood should move today toward recovery only if you accept it.',
            }
          : null);

  // Today's scheduled session from planState
  const todaySession = useMemo(
    () => planState.sessions.find(s => toDateKey(s.date) === todayKey) ?? null,
    [planState.sessions, todayKey],
  );

  // Current workout: prefer one explicitly scheduled for today, then fall back
  const currentWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    const scheduledToday = workouts.find(
      w => w.scheduledDate === todayKey && w.programId === 'hyrox' && w.status !== 'completed',
    );
    if (scheduledToday) return scheduledToday;
    return workouts.find(w => getWorkoutProgramKey(w) === 'hyrox' && w.status !== 'completed')
      ?? workouts.find(w => w.status !== 'completed')
      ?? workouts[0]
      ?? null;
  }, [activeWorkout, workouts, todayKey]);

  // Sessions from this week that are overdue with no completed workout
  const missedSessions = useMemo(
    () => planState.sessions.filter(session => {
      const sessionKey = toDateKey(session.date);
      if (sessionKey >= todayKey) return false;
      return !workouts.some(
        w => w.scheduledDate === sessionKey && w.status === 'completed' &&
             (w.programId === 'hyrox' || w.sessionOffset === session.offset),
      );
    }),
    [planState.sessions, todayKey, workouts],
  );
  const unacknowledgedMisses = useMemo(
    () => missedSessions.filter(s => !acknowledgedMisses.has(`hyrox-${toDateKey(s.date)}`)),
    [missedSessions, acknowledgedMisses],
  );

  // Set of scheduledDate strings with a completed workout (for marking the plan view)
  const completedScheduledDates = useMemo(
    () => new Set(workouts.filter(w => w.status === 'completed' && w.scheduledDate).map(w => w.scheduledDate)),
    [workouts],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function startWorkout(workoutId) {
    onStartWorkout(workoutId);
    setWorkouts(current => current.map(workout => (
      workout.id === workoutId
        ? {
            ...workout,
            status: 'active',
            type: getWorkoutProgramKey(workout),
            programId: getWorkoutProgramKey(workout),
            programName: workout.programName || 'HYROX',
          }
        : workout.status === 'active'
          ? { ...workout, status: 'planned' }
        : workout
    )));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'planned' } : workout
    )));
    onStartWorkout(null);
  }

  function completeWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'completed' } : workout
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
    upsertNotification('Fitness check-in saved', `${checkInDraft.mood} · ${checkInDraft.energy}/5`);
    setAcceptedRecovery(false);
  }

  function skipCheckIn() {
    setEnergyState(current => ({
      ...current,
      lastCheckIn: new Date().toISOString(),
    }));
    setAcceptedRecovery(false);
  }

  function acceptRecoverySuggestion() {
    setAcceptedRecovery(true);
    upsertNotification('Recovery accepted', 'Today is now recovery-first.');
  }

  // Creates a workout instance from today's scheduled session and starts it
  function startTodaysWorkout() {
    if (!todaySession) return;
    const newWorkout = createWorkout({
      name: todaySession.title,
      programId: 'hyrox',
      programName: 'HYROX',
      type: 'hyrox',
      scheduledDate: todayKey,
      sessionOffset: todaySession.offset,
      trainingDays: fitnessSettings.trainingDays,
      exercises: [
        createExercise({ name: 'Warm-up', detail: '5–10 min' }),
        createExercise({ name: todaySession.title, detail: todaySession.detail, sets: 3 }),
        createExercise({ name: 'Cooldown', detail: '5 min mobility' }),
      ],
    });
    setWorkouts(current => [newWorkout, ...current]);
    startWorkout(newWorkout.id);
  }

  // Reschedules a missed session to the next valid training day (user-approved)
  function moveMissedSession(session) {
    const afterKey = toDateKey(session.date);
    const laterThisWeek = planState.sessions.find(s => toDateKey(s.date) > afterKey);
    let nextDate = laterThisWeek ? toDateKey(laterThisWeek.date) : null;
    if (!nextDate) {
      const nextWeekSessions = hyroxBuildWeeklySchedule({
        trainingDays: fitnessSettings.trainingDays,
        weekNumber: planState.week + 1,
        startDate: programStartDate,
      });
      nextDate = nextWeekSessions.length > 0 ? toDateKey(nextWeekSessions[0].date) : null;
    }
    if (!nextDate) {
      upsertNotification('Reschedule failed', 'No upcoming training day found in schedule.');
      return;
    }
    const newWorkout = createWorkout({
      name: session.title,
      programId: 'hyrox',
      programName: 'HYROX',
      type: 'hyrox',
      scheduledDate: nextDate,
      sessionOffset: session.offset,
      trainingDays: fitnessSettings.trainingDays,
      exercises: [
        createExercise({ name: 'Warm-up', detail: '5–10 min' }),
        createExercise({ name: session.title, detail: session.detail, sets: 3 }),
        createExercise({ name: 'Cooldown', detail: '5 min mobility' }),
      ],
    });
    setWorkouts(current => [newWorkout, ...current]);
    setAcknowledgedMisses(prev => new Set([...prev, `hyrox-${toDateKey(session.date)}`]));
    upsertNotification('Session rescheduled', `${session.title} moved to ${nextDate}`);
  }

  // Dismisses a missed session without rescheduling
  function skipMissedSession(session) {
    setAcknowledgedMisses(prev => new Set([...prev, `hyrox-${toDateKey(session.date)}`]));
    upsertNotification('Session skipped', session.title);
  }

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
          {needsCheckIn && (
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
                    {[1, 2, 3, 4, 5].map(value => (
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
                    onChange={event => setCheckInDraft(current => ({
                      ...current,
                      sleepHours: Number.parseFloat(event.target.value),
                    }))}
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
              {recoverySuggested && (
                <div className="feed-card">
                  <strong>{recoverySuggested.title}</strong>
                  <p>{recoverySuggested.detail}</p>
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
          )}

          {unacknowledgedMisses.length > 0 && (
            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Missed session</p>
                  <h2>{unacknowledgedMisses[0].title}</h2>
                </div>
              </div>
              <article className="feed-card">
                <strong>{unacknowledgedMisses[0].title}</strong>
                <p>Scheduled {unacknowledgedMisses[0].dateLabel} · {unacknowledgedMisses[0].detail}</p>
                <p className="empty-message">This session was missed. Move it to the next training day, or skip it to keep your sequence clean.</p>
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
                <p className="eyebrow">Today&apos;s workout</p>
                <h2>{todaySession ? todaySession.title : currentWorkout?.name || 'Rest day'}</h2>
              </div>
            </div>
            {todaySession && !currentWorkout?.scheduledDate ? (
              <article className="feed-card">
                <strong>{todaySession.title}</strong>
                <p>HYROX · {todaySession.detail}</p>
                <p>Week {programWeek} · {programPhase} · {fitnessSettings.trainingDays}</p>
                {todaySession.stations.length > 0 && (
                  <p className="empty-message">{todaySession.stations.map(s => s.name).join(' · ')}</p>
                )}
                <button type="button" className="secondary-button" onClick={startTodaysWorkout}>
                  Start Today&apos;s Workout
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
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Weekly stats" title="Training progress and trend" />
            <div className="ui-metrics-row">
              <MetricBlock value={weeklyStats.workoutsCompleted} label="Workouts" />
              <MetricBlock value={weeklyStats.milesCompleted.toFixed(1)} label="Miles" />
              <MetricBlock value={weeklyStats.strengthSessions} label="Strength" />
              <MetricBlock value={weeklyStats.recoverySessions} label="Recovery" />
            </div>
            <p className="empty-message">
              Trend: {weeklyStats.workoutTrend >= 0 ? '+' : ''}{weeklyStats.workoutTrend} workouts versus the previous 7 days.
            </p>
          </section>
        </>
      )}

      {activeSubTab === 'plan' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="Active program" title="HYROX" />
            <p className="empty-message">{phase.description}</p>
            <div className="tag-row">
              {['Race prep', 'Hybrid', 'Engine'].map(tag => (
                <span key={tag} className="status-chip is-active">{tag}</span>
              ))}
            </div>
            <div className="ui-metrics-row">
              <MetricBlock value={programWeek} label="Current week" />
              <MetricBlock value={programPhase} label="Current phase" />
              <MetricBlock value={fitnessSettings.trainingDays} label="Frequency" />
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Goal card</p>
                <h2>Race build</h2>
              </div>
            </div>
            <div className="summary-row">
              <div className="summary-tile">
                <span>Race</span>
                <strong>{fitnessSettings.raceName || 'Not set'}</strong>
              </div>
              <div className="summary-tile">
                <span>Countdown</span>
                <strong>{programCountdown || 'Not set'}</strong>
              </div>
              <div className="summary-tile">
                <span>Program week</span>
                <strong>{programWeek}</strong>
              </div>
            </div>
            <p className="empty-message">
              Race countdown: {programCountdown || 'Set a race date in Settings.'}
            </p>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Training settings</p>
                <h2>Manage in Settings</h2>
              </div>
            </div>
            <div className="summary-row">
              <div className="summary-tile">
                <span>Training days</span>
                <strong>{fitnessSettings.trainingDays}</strong>
              </div>
              <div className="summary-tile">
                <span>Start date</span>
                <strong>{fitnessSettings.programStartDate}</strong>
              </div>
              <div className="summary-tile">
                <span>Category</span>
                <strong>{fitnessSettings.raceCategory || 'Not set'}</strong>
              </div>
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Weekly schedule" title="Program week layout" />
            <div className="subtle-feed">
              {weeklySchedule.map(session => {
                const sessionKey = toDateKey(session.date);
                const isDone = completedScheduledDates.has(sessionKey);
                const isToday = sessionKey === todayKey;
                const stationNames = session.stations.length > 0 ? ` · ${session.stations.map(s => s.name).join(', ')}` : '';
                return (
                  <ListRow
                    key={`${session.title}-${session.offset}`}
                    variant="card"
                    label={`${isDone ? '✓ ' : isToday ? '→ ' : ''}${session.dayLabel} · ${session.title}`}
                    sub={`${session.dateLabel} · ${session.detail}${stationNames}`}
                  />
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
                <ListRow
                  key={station.key}
                  variant="card"
                  label={station.name}
                  sub={`${station.raceDistance} ${station.unit} · ${station.category}`}
                />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Saved workouts" title="Completed sessions" />
            <div className="subtle-feed">
              {workoutLogs.filter(w => w.status === 'completed').length > 0 ? (
                workoutLogs.filter(w => w.status === 'completed').slice(0, 5).map(workout => (
                  <ListRow
                    key={workout.id}
                    variant="card"
                    label={workout.name}
                    sub={`${workout.programName || 'HYROX'} · ${workout.duration} min`}
                  />
                ))
              ) : (
                <EmptyState
                  title="No completed workouts yet"
                  description="Finished sessions will appear here as you log them."
                />
              )}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'logging' && (
        <>
          <section className="task-card">
            <SectionHeader eyebrow="Logging" title="Lightweight and expandable" />
            <div className="ui-metrics-row">
              <MetricBlock value={workoutLogs.length} label="Workouts" />
              <MetricBlock value={runLogs.length} label="Runs" />
              <MetricBlock value={strengthLogs.length} label="Strength" />
              <MetricBlock value={recoveryLogs.length} label="Recovery" />
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Workouts" title="Session history" />
            <div className="subtle-feed">
              {workoutLogs.slice(0, 3).map(workout => (
                <ListRow key={workout.id} variant="card" label={workout.name} sub={`${workout.duration} min · ${workout.status}`} />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Runs" title="Distance or speed notes" />
            <div className="subtle-feed">
              {runLogs.slice(0, 3).map(workout => (
                <ListRow
                  key={workout.id}
                  variant="card"
                  label={workout.name}
                  sub={`${workout.distanceMiles ? `${workout.distanceMiles.toFixed(1)} miles` : `${workout.duration} min`} · ${workout.status}`}
                />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Strength" title="Load and volume placeholders" />
            <div className="subtle-feed">
              {strengthLogs.slice(0, 3).map(workout => (
                <ListRow key={workout.id} variant="card" label={workout.name} sub={`${workout.programName || 'Strength'} · ${workout.status}`} />
              ))}
            </div>
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Recovery" title="Downshift sessions" />
            <div className="subtle-feed">
              {recoveryLogs.slice(0, 3).map(workout => (
                <ListRow key={workout.id} variant="card" label={workout.name} sub={`${workout.programName || 'Recovery'} · ${workout.status}`} />
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

function AppShell() {
  const {
    setNotifications,
    createNotification,
    setTasks,
    setMeals,
    setNotes,
    setWorkouts,
    createTask,
    createMeal,
    createNote,
    createWorkout,
    notifications,
    calendarItems: weeklyItems,
    setCalendarItems: setWeeklyItems,
  } = useTaskContext();
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationCenterOpen,
    setNotificationCenterOpen,
    showMorningCheckin,
    setShowMorningCheckin,
    energyState,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [now, setNow] = useState(() => new Date());

  // Auto-open morning check-in when user hasn't checked in today
  useEffect(() => {
    const lastCheckIn = energyState.lastCheckIn;
    const alreadyCheckedIn = lastCheckIn && sameDay(new Date(lastCheckIn), now);
    if (!alreadyCheckedIn && !showMorningCheckin) {
      setShowMorningCheckin(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const unreadNotifications = useMemo(
    () => notifications.filter(notification => !notification.read),
    [notifications],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function handleQuickAdd({ type, title, notes: noteText, tags, duration, content }) {
    if (type === 'task') {
      const taskTitle = title.trim();
      if (!taskTitle) return;

      setTasks(current => [createTask({ status: 'active', title: taskTitle, notes: noteText }), ...current]);
      upsertNotification('Task captured', taskTitle);
      return;
    }

    if (type === 'meal') {
      const mealTitle = title.trim();
      if (!mealTitle) return;

      setMeals(current => [createMeal({ name: mealTitle, tags }), ...current]);
      upsertNotification('Meal logged', mealTitle);
      return;
    }

    if (type === 'workout') {
      const workoutTitle = title.trim();
      if (!workoutTitle) return;

      setWorkouts(current => [createWorkout({ name: workoutTitle, duration: Number.isFinite(duration) ? duration : 30 }), ...current]);
      upsertNotification('Workout saved', workoutTitle);
      return;
    }

    const note = content.trim();
    if (!note) return;

    setNotes(current => [createNote({ content: note }), ...current]);
    upsertNotification('Note saved', note.slice(0, 40));
  }

  function markAllNotificationsRead() {
    setNotifications(current => current.map(notification => ({ ...notification, read: true })));
  }

  const primaryScreen = useMemo(() => {
    if (activeTab === 'calendar') {
      return <CalendarScreen weeklyItems={weeklyItems} setWeeklyItems={setWeeklyItems} />;
    }

    if (activeTab === 'nutrition') {
      return <NutritionScreen now={now} />;
    }

    if (activeTab === 'fitness') {
      return <FitnessScreen now={now} activeWorkoutId={activeWorkoutId} onStartWorkout={setActiveWorkoutId} />;
    }

    if (activeTab === 'finance') {
      return <FinanceScreen />;
    }

    if (activeTab === 'home') {
      return (
        <DashboardScreen
          inboxCount={unreadNotifications.length}
          now={now}
          activeWorkoutId={activeWorkoutId}
          onStartWorkout={setActiveWorkoutId}
          onSwitchToFitness={() => setActiveTab('fitness')}
          weeklyItems={weeklyItems}
        />
      );
    }

    return null;
  }, [activeTab, activeWorkoutId, now, setWeeklyItems, unreadNotifications.length, weeklyItems]);

  return (
    <>
      <AppFrame
        tabs={ROOT_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        userName="Alex"
        inboxCount={unreadNotifications.length}
        onOpenInbox={() => setNotificationCenterOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {primaryScreen}
      </AppFrame>

      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
      />

      <InboxView
        isOpen={notificationCenterOpen}
        notifications={notifications}
        onClose={() => setNotificationCenterOpen(false)}
        onMarkAllRead={markAllNotificationsRead}
      />

      <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

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
