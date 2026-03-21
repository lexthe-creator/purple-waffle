import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import WeeklyPreview from './components/WeeklyPreview.jsx';
import InboxView from './views/InboxView.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
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
    id: 'dashboard',
    label: 'Dashboard',
    iconPath: '<path d="M3 12L12 3l9 9v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9Z"/><polyline points="9 22 9 12 15 12 15 22"/>',
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
    iconPath: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  },
];

const FITNESS_SUBTABS = [
  { id: 'today', label: 'Today' },
  { id: 'plan', label: 'Plan' },
  { id: 'library', label: 'Workout Library' },
  { id: 'logging', label: 'Logging' },
];

const FITNESS_PROGRAMS = {
  hyrox: {
    id: 'hyrox',
    name: 'HYROX',
    description: 'Hybrid prep with stations, strength, and runs.',
    tags: ['Race prep', 'Hybrid', 'Engine'],
    goalLabel: 'Race build',
    countdownLabel: 'Race countdown',
    focus: 'hybrid',
    schedules: {
      '4-day': [
        { offset: 0, title: 'Strength + stations', detail: 'Lower body and sled patterning' },
        { offset: 1, title: 'Run intervals', detail: 'Short repeats with controlled breathing' },
        { offset: 3, title: 'Hybrid brick', detail: 'Mixed station work and tempo running' },
        { offset: 5, title: 'Recovery reset', detail: 'Mobility, easy spin, and tissue work' },
      ],
      '5-day': [
        { offset: 0, title: 'Strength + stations', detail: 'Heavy compound work' },
        { offset: 1, title: 'Run intervals', detail: 'Quality speed work' },
        { offset: 2, title: 'Engine builder', detail: 'Aerobic conditioning' },
        { offset: 4, title: 'Hybrid brick', detail: 'Race-specific combinations' },
        { offset: 5, title: 'Recovery reset', detail: 'Mobility and easy movement' },
      ],
    },
  },
  strength: {
    id: 'strength',
    name: 'Strength',
    description: 'Progressive lifting with enough recovery to keep moving.',
    tags: ['Lift', 'Progressive', 'Base'],
    goalLabel: 'Strength build',
    countdownLabel: null,
    focus: 'strength',
    schedules: {
      '4-day': [
        { offset: 0, title: 'Lower body', detail: 'Squat pattern and accessory work' },
        { offset: 1, title: 'Upper body', detail: 'Press, pull, and trunk control' },
        { offset: 3, title: 'Full body', detail: 'Compound lifts with moderate volume' },
        { offset: 5, title: 'Recovery', detail: 'Walk, mobility, and reset' },
      ],
      '5-day': [
        { offset: 0, title: 'Lower body', detail: 'Primary strength session' },
        { offset: 1, title: 'Upper body', detail: 'Push and pull volume' },
        { offset: 2, title: 'Power', detail: 'Explosive work and carries' },
        { offset: 4, title: 'Full body', detail: 'Second heavy lift' },
        { offset: 5, title: 'Recovery', detail: 'Mobility and tissue work' },
      ],
    },
  },
  running: {
    id: 'running',
    name: 'Running',
    description: 'Mileage and quality work with compact recovery support.',
    tags: ['Mileage', 'Intervals', 'Tempo'],
    goalLabel: 'Race / mileage build',
    countdownLabel: 'Goal countdown',
    focus: 'running',
    schedules: {
      '4-day': [
        { offset: 0, title: 'Easy run', detail: 'Aerobic base and cadence' },
        { offset: 1, title: 'Intervals', detail: 'Threshold or VO2 reps' },
        { offset: 3, title: 'Tempo', detail: 'Steady effort with pace control' },
        { offset: 5, title: 'Long run', detail: 'The week’s mileage anchor' },
      ],
      '5-day': [
        { offset: 0, title: 'Easy run', detail: 'Light aerobic volume' },
        { offset: 1, title: 'Intervals', detail: 'Quality speed session' },
        { offset: 2, title: 'Recovery jog', detail: 'Short shakeout' },
        { offset: 4, title: 'Tempo', detail: 'Controlled steady effort' },
        { offset: 5, title: 'Long run', detail: 'Mileage anchor' },
      ],
    },
  },
  pilates: {
    id: 'pilates',
    name: 'Pilates',
    description: 'Core control, posture, and smooth movement quality.',
    tags: ['Core', 'Mobility', 'Control'],
    goalLabel: 'Movement quality',
    countdownLabel: null,
    focus: 'mobility',
    schedules: {
      '4-day': [
        { offset: 0, title: 'Mat flow', detail: 'Core and breath-led control' },
        { offset: 1, title: 'Stability', detail: 'Balance and trunk sequencing' },
        { offset: 3, title: 'Reformer / flow', detail: 'Longer controlled session' },
        { offset: 5, title: 'Recovery walk', detail: 'Light reset and mobility' },
      ],
      '5-day': [
        { offset: 0, title: 'Mat flow', detail: 'Spine articulation and core' },
        { offset: 1, title: 'Stability', detail: 'Single-leg control' },
        { offset: 2, title: 'Mobility', detail: 'Restore range and posture' },
        { offset: 4, title: 'Reformer / flow', detail: 'Longer session' },
        { offset: 5, title: 'Recovery walk', detail: 'Easy movement' },
      ],
    },
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery',
    description: 'Restore first, then stack the next session.',
    tags: ['Recovery', 'Reset', 'Low load'],
    goalLabel: 'Restore',
    countdownLabel: null,
    focus: 'recovery',
    schedules: {
      '4-day': [
        { offset: 0, title: 'Mobility', detail: 'Gentle full-body range work' },
        { offset: 1, title: 'Easy walk', detail: 'Keep circulation moving' },
        { offset: 3, title: 'Breath + mobility', detail: 'Short reset block' },
        { offset: 5, title: 'Soft tissue', detail: 'Self-massage and unwind' },
      ],
      '5-day': [
        { offset: 0, title: 'Mobility', detail: 'Gentle reset' },
        { offset: 1, title: 'Easy walk', detail: 'Very low intensity' },
        { offset: 2, title: 'Breath work', detail: 'Recovery emphasis' },
        { offset: 4, title: 'Mobility', detail: 'Second reset touchpoint' },
        { offset: 5, title: 'Soft tissue', detail: 'Unwind and prepare' },
      ],
    },
  },
};

const FITNESS_PROGRAM_ORDER = ['hyrox', 'strength', 'running', 'pilates', 'recovery'];
const FITNESS_FREQUENCIES = ['4-day', '5-day'];
const FITNESS_ANCHORS = ['Sunday', 'Monday', 'Wednesday'];
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

function getProgramPhase(weekNumber) {
  if (weekNumber <= 2) return 'Base';
  if (weekNumber <= 4) return 'Build';
  if (weekNumber <= 6) return 'Peak';
  return 'Taper';
}

function getWorkoutProgramKey(workout) {
  return inferWorkoutProgram(workout);
}

function buildWeeklySchedule(program, frequency, anchorDay, now) {
  const template = program?.schedules?.[frequency] || [];
  const weekStart = alignDateToAnchor(now, anchorDay);

  return template.map(session => {
    const date = addDays(weekStart, session.offset);
    return {
      ...session,
      date,
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: formatShortMonthDay(date),
    };
  });
}

function getWorkoutStats(workouts, now, selectedProgramId) {
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
  const selectedCurrent = currentWeek.filter(workout => getWorkoutProgramKey(workout) === selectedProgramId);

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

function RootTabPanel({ id, activeTab, children }) {
  const isActive = activeTab === id;

  return (
    <section className="root-tab-panel" data-tab={id} hidden={!isActive} aria-hidden={!isActive}>
      {children}
    </section>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toolbar-icon">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.2 3.5c0-.36-.03-.7-.09-1.04l2.06-1.61-1.95-3.38-2.5 1a8.02 8.02 0 0 0-1.8-1.04l-.38-2.65H9.46l-.38 2.65c-.64.25-1.24.6-1.8 1.04l-2.5-1-1.95 3.38 2.06 1.61c-.06.34-.09.68-.09 1.04s.03.7.09 1.04L2.83 14.65l1.95 3.38 2.5-1c.56.44 1.16.79 1.8 1.04l.38 2.65h5.88l.38-2.65c.64-.25 1.24-.6 1.8-1.04l2.5 1 1.95-3.38-2.06-1.61c.06-.34.09-.68.09-1.04Z" />
    </svg>
  );
}

function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Primary tabs">
      {ROOT_TABS.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`bottom-nav-button ${activeTab === tab.id ? 'is-active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: tab.iconPath }}
          />
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function SettingsSheet({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card settings-sheet" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>App shell</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-stack">
          <article className="settings-card">
            <strong>Navigation</strong>
            <p>Bottom tabs stay mounted, and global actions remain available from every screen.</p>
          </article>
          <article className="settings-card">
            <strong>Capture</strong>
            <p>The brain dump action and floating capture button both open quick add.</p>
          </article>
          <article className="settings-card">
            <strong>More</strong>
            <p>This screen is reserved for summaries and rollups, not configuration.</p>
          </article>
        </div>
      </section>
    </div>
  );
}

function DashboardScreen({ inboxCount, now, activeWorkoutId, onStartWorkout, calendarItems }) {
  const { tasks, setTasks, meals, workouts, notifications, createTask, createSubtask } = useTaskContext();
  const [dailySearch, setDailySearch] = useState('');
  const [priorityOnly, setPriorityOnly] = useState(true);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [mealsExpanded, setMealsExpanded] = useState(false);
  const [prioritiesExpanded, setPrioritiesExpanded] = useState(false);
  const [stripExpanded, setStripExpanded] = useState(false);

  const orderedTasks = useMemo(() => {
    const rank = { active: 0, planned: 1, done: 2 };

    return [...tasks].sort((a, b) => {
      const statusDelta = rank[a.status] - rank[b.status];
      if (statusDelta !== 0) return statusDelta;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [tasks]);

  const activeTasks = useMemo(() => orderedTasks.filter(task => task.status !== 'done'), [orderedTasks]);
  const completedTasks = useMemo(() => orderedTasks.filter(task => task.status === 'done'), [orderedTasks]);
  const todayKey = toDateKey(now);
  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );
  const todaysAgendaItems = useMemo(() => {
    const items = [];

    tasks.forEach(task => {
      if (task.status === 'done') return;
      if (priorityOnly && task.status !== 'active') return;
      if (dailySearch && !task.title.toLowerCase().includes(dailySearch.toLowerCase())) return;
      items.push({
        id: task.id,
        type: 'task',
        title: task.title || 'Untitled task',
        subtitle: task.status === 'active' ? 'In execution' : 'Planned',
      });
    });

    meals.forEach(meal => {
      if (toDateKey(meal.loggedAt) !== todayKey) return;
      items.push({
        id: meal.id,
        type: 'meal',
        title: meal.name || 'Meal',
        subtitle: meal.tags.length ? meal.tags.join(' · ') : 'Logged today',
      });
    });

    workouts.forEach(workout => {
      if (workout.status === 'completed' && !sameDay(workout.createdAt, now)) return;
      items.push({
        id: workout.id,
        type: 'workout',
        title: workout.name,
        subtitle: `${workout.duration} min · ${workout.status}`,
      });
    });

    calendarItems.forEach(item => {
      if (item.date !== todayKey || item.type !== 'busy') return;
      items.push({
        id: item.id,
        type: 'busy',
        title: item.title,
        subtitle: `${item.startTime} - ${item.endTime}`,
      });
    });

    notifications.slice(0, 3).forEach(notification => {
      items.push({
        id: notification.id,
        type: 'inbox',
        title: notification.title,
        subtitle: notification.detail || 'Inbox item',
      });
    });

    return items.slice(0, agendaExpanded ? 5 : 3);
  }, [agendaExpanded, calendarItems, dailySearch, meals, notifications, now, priorityOnly, tasks, workouts, todayKey]);

  const todayBusyBlocks = useMemo(() => {
    return calendarItems.filter(item => item.date === todayKey && item.type === 'busy');
  }, [calendarItems, todayKey]);

  const dailyProgress = useMemo(() => {
    const completed = tasks.filter(task => task.status === 'done').length;
    const total = tasks.length || 1;
    return Math.round((completed / total) * 100);
  }, [tasks]);

  const activeWorkout = useMemo(() => {
    if (!activeWorkoutId) return null;
    return workouts.find(workout => workout.id === activeWorkoutId) ?? null;
  }, [activeWorkoutId, workouts]);

  const nextWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    return workouts.find(workout => workout.status !== 'completed') ?? workouts[0] ?? null;
  }, [activeWorkout, workouts]);

  const priorityItems = useMemo(
    () => orderedTasks.filter(task => task.status === 'active' || task.subtasks.some(subtask => subtask.done === false)).slice(0, 4),
    [orderedTasks],
  );

  const visiblePriorityItems = prioritiesExpanded ? priorityItems : priorityItems.slice(0, 2);

  const sevenDayStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(now, index);
      const key = toDateKey(day);
      return {
        id: key,
        label: formatDateLabel(key),
        date: key,
        flaggedCount: [
          ...tasks.filter(task => (task.status === 'active' || task.status === 'planned') && index <= 2),
          ...meals.filter(meal => toDateKey(meal.loggedAt) === key),
        ].length > 0 ? 1 : 0,
      };
    }).filter(item => item.flaggedCount > 0);
  }, [meals, now, tasks]);

  const visibleSevenDayStrip = stripExpanded ? sevenDayStrip : sevenDayStrip.slice(0, 3);
  const visibleMeals = mealsExpanded ? todaysMeals : todaysMeals.slice(0, 1);

  function updateTask(taskId, updates) {
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, ...updates } : task)));
  }

  function deleteTask(taskId) {
    setTasks(current => current.filter(task => task.id !== taskId));
  }

  function toggleTaskDone(taskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? { ...task, status: task.status === 'done' ? 'active' : 'done' }
        : task
    )));
  }

  function setTaskStatus(taskId, status) {
    updateTask(taskId, { status });
  }

  function toggleSubtask(taskId, subtaskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? {
            ...task,
            subtasks: task.subtasks.map(subtask => (
              subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
            )),
          }
        : task
    )));
  }

  function addSubtask(taskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? { ...task, subtasks: [...task.subtasks, createSubtask('')] }
        : task
    )));
  }

  function addInlineTask() {
    setTasks(current => [createTask({ status: 'active', shouldFocusTitle: true }), ...current]);
  }

  function convertInboxToTask(notificationId) {
    const source = notifications.find(notification => notification.id === notificationId);
    if (!source) return;

    setTasks(current => [
      createTask({
        status: 'active',
        title: source.title,
        notes: source.detail,
        shouldFocusTitle: true,
      }),
      ...current,
    ]);
  }

  function moveTask(taskId, direction) {
    setTasks(current => {
      const index = current.findIndex(task => task.id === taskId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">{formatFullDate(now)}</p>
            <h2>{getGreeting(now)}</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setPriorityOnly(current => !current)}>
            {priorityOnly ? 'Priority only' : 'Show all'}
          </button>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Today card</p>
            <h2>Open-day context</h2>
          </div>
        </div>
        <div className="summary-row">
          <div className="summary-tile">
            <span>Tasks</span>
            <strong>{tasks.filter(task => task.status !== 'done').length}</strong>
          </div>
          <div className="summary-tile">
            <span>Meals</span>
            <strong>{todaysMeals.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Blocks</span>
            <strong>{todayBusyBlocks.length}</strong>
          </div>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Agenda</p>
            <h2>Today only</h2>
          </div>
          <div className="header-stack">
            <input
              className="task-title-input compact-search"
              value={dailySearch}
              onChange={event => setDailySearch(event.target.value)}
              placeholder="Filter today"
            />
            <button type="button" className="ghost-button compact-ghost" onClick={() => setAgendaExpanded(current => !current)}>
              {agendaExpanded ? 'Less' : 'More'}
            </button>
          </div>
        </div>
        <div className="subtle-feed">
          {todaysAgendaItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No items for today</strong>
              <p>Capture something with the plus button.</p>
            </div>
          ) : (
            todaysAgendaItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Daily progress</p>
            <h2>Execution momentum</h2>
          </div>
          <strong>{dailyProgress}%</strong>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${dailyProgress}%` }} />
        </div>
      </section>

      <section className="task-card execution-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Daily execution</p>
            <h2>Run the day from here</h2>
          </div>
          <button type="button" className="primary-button" onClick={addInlineTask}>
            + Add task
          </button>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Active</span>
            <strong>{activeTasks.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Done</span>
            <strong>{completedTasks.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Inbox</span>
            <strong>{inboxCount}</strong>
          </div>
        </div>

        <div className="quick-entry-row">
          <button type="button" className="ghost-button compact-ghost" onClick={() => setPriorityOnly(current => !current)}>
            {priorityOnly ? 'Priority focus' : 'All tasks'}
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={addInlineTask}>
            Quick add task
          </button>
        </div>

        <div className="execution-list">
          {orderedTasks.length === 0 ? (
            <div className="empty-panel">
              <strong>No tasks yet</strong>
              <p>Capture one inline and keep moving.</p>
            </div>
          ) : (
            orderedTasks.map(task => (
              <ExecutionTaskItem
                key={task.id}
                task={task}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onToggleDone={toggleTaskDone}
                onToggleSubtask={toggleSubtask}
                onAddSubtask={addSubtask}
                onSetStatus={setTaskStatus}
                onMoveUp={() => moveTask(task.id, -1)}
                onMoveDown={() => moveTask(task.id, 1)}
              />
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Inbox to task</p>
            <h2>Promote an item</h2>
          </div>
        </div>
        <div className="subtle-feed">
          {notifications.length === 0 ? (
            <div className="empty-panel">
              <strong>No inbox items</strong>
              <p>Inbox items can be converted directly into tasks.</p>
            </div>
          ) : (
            notifications.slice(0, 3).map(notification => (
              <article key={notification.id} className="feed-card">
                <strong>{notification.title}</strong>
                <p>{notification.detail || 'Inbox item'}</p>
                <button type="button" className="ghost-button compact-ghost" onClick={() => convertInboxToTask(notification.id)}>
                  Convert to task
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Today&apos;s workout</p>
            <h2>Workout card</h2>
          </div>
        </div>
        {nextWorkout ? (
          <article className="feed-card">
            <strong>{nextWorkout.name}</strong>
            <p>{nextWorkout.type || 'Workout'} · {nextWorkout.duration} min · {nextWorkout.status}</p>
            <button type="button" className="secondary-button" onClick={() => onStartWorkout(nextWorkout.id)}>
              {activeWorkout ? 'Continue' : 'Start'}
            </button>
          </article>
        ) : (
          <div className="empty-panel">
            <strong>No workout exists yet</strong>
            <p>Add one with quick capture.</p>
          </div>
        )}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Meal summary</p>
            <h2>Today&apos;s meals only</h2>
          </div>
          {todaysMeals.length > 1 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setMealsExpanded(current => !current)}>
              {mealsExpanded ? 'Less' : `${todaysMeals.length} meals`}
            </button>
          )}
        </div>
        {visibleMeals.length > 0 ? (
          <div className="subtle-feed">
            {visibleMeals.map(meal => (
              <article key={meal.id} className="feed-card">
                <strong>{meal.name}</strong>
                <p>{meal.tags.length ? meal.tags.join(' · ') : 'No tags yet'}</p>
              </article>
            ))}
            {!mealsExpanded && todaysMeals.length > 1 && (
              <p className="empty-message">{todaysMeals.length - 1} more meals hidden</p>
            )}
          </div>
        ) : (
          <div className="empty-panel">
            <strong>No meals logged today</strong>
            <p>Nutrition stays lightweight here.</p>
          </div>
        )}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Task priorities</p>
            <h2>What matters now</h2>
          </div>
          {priorityItems.length > 2 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setPrioritiesExpanded(current => !current)}>
              {prioritiesExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="subtle-feed">
          {visiblePriorityItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No active priorities</strong>
              <p>Promote a task to active to surface it here.</p>
            </div>
          ) : (
            visiblePriorityItems.map(task => (
              <article key={task.id} className="feed-card">
                <strong>{task.title}</strong>
                <p>{task.status} · {task.subtasks.filter(subtask => subtask.done === false).length} open subtasks</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">7-day strip</p>
            <h2>Flagged items only</h2>
          </div>
          {sevenDayStrip.length > 3 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setStripExpanded(current => !current)}>
              {stripExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="week-strip">
          {visibleSevenDayStrip.length === 0 ? (
            <p className="empty-message">No flagged items in the next seven days.</p>
          ) : (
            visibleSevenDayStrip.map(item => (
              <article key={item.id} className="week-strip-item">
                <strong>{item.label}</strong>
                <p>Flagged</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Quick capture</p>
            <h2>Access always stays close</h2>
          </div>
        </div>
        <p className="empty-message">Use the floating plus button or the top brain dump action.</p>
      </section>
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
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2>{selectedDateLabel}</h2>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button">Open daily</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('busy')}>Add busy</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('event')}>Add event</button>
        </div>
        <div className="subtle-feed">
          {selectedItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No items scheduled</strong>
              <p>Add a busy block or event below.</p>
            </div>
          ) : (
            selectedItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.type} · {item.startTime} - {item.endTime}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Add busy</p>
            <h2>Work time not tied to integrations</h2>
          </div>
        </div>
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
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Add event</p>
            <h2>Manual event entry</h2>
          </div>
        </div>
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
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Schedule pattern</p>
            <h2>Save this schedule as a pattern</h2>
          </div>
        </div>
        <div className="subtle-feed">
          {visiblePatternItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No visible pattern items</strong>
              <p>Selected-day items appear here before saving as a pattern.</p>
            </div>
          ) : (
            visiblePatternItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.type} · weekly pattern ready</p>
              </article>
            ))
          )}
        </div>
        <button type="button" className="secondary-button" onClick={savePattern}>Save this schedule as a pattern</button>
        {patternOpen && <p className="empty-message">Pattern saved locally for repeat weekly use. {savedPattern.length} items captured.</p>}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Integration</p>
            <h2>Connect Google</h2>
          </div>
        </div>
        <p className="empty-message">Optional prompt only. Settings remains the place for integration setup.</p>
        <button type="button" className="ghost-button compact-ghost">Connect Google</button>
      </section>
    </div>
  );
}

function NutritionScreen({ now }) {
  const { meals, setMeals, createMeal, setNotifications, createNotification } = useTaskContext();
  const [mealName, setMealName] = useState('');
  const [mealTags, setMealTags] = useState([]);
  const [mealSlot, setMealSlot] = useState('auto');
  const [planDrafts, setPlanDrafts] = useState(() => Object.fromEntries(NUTRITION_SLOTS.map(slot => [slot.id, ''])));
  const [pantryDraft, setPantryDraft] = useState('');
  const [pantryItems, setPantryItems] = useState(['Eggs', 'Oats', 'Rice', 'Greek yogurt']);
  const [prepNote, setPrepNote] = useState('');
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

  useEffect(() => {
    setPlanDrafts(current => {
      const next = { ...current };
      NUTRITION_SLOTS.forEach(slot => {
        const plannedMeal = plannedEntries.find(meal => inferMealSlot(meal) === slot.id);
        if (plannedMeal) {
          next[slot.id] = plannedMeal.name;
        } else if (!current[slot.id]) {
          next[slot.id] = '';
        }
      });
      return next;
    });
  }, [plannedEntries, todayKey]);

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
    const plannedMeals = NUTRITION_SLOTS.flatMap(slot => {
      const trimmed = planDrafts[slot.id]?.trim();
      if (!trimmed) return [];
      return [
        createMeal({
          name: trimmed,
          tags: ['planned', `slot:${slot.id}`],
        }),
      ];
    });

    setMeals(current => {
      const currentDayMeals = current.filter(meal => {
        if (toDateKey(meal.loggedAt) !== todayKey) return true;
        if (!isPlannedMeal(meal)) return true;
        return !NUTRITION_SLOTS.some(slot => inferMealSlot(meal) === slot.id);
      });

      return [...plannedMeals, ...currentDayMeals];
    });

    upsertNotification('Meal plan saved', 'Today\'s planned meals updated');
  }

  function savePantryItem() {
    const trimmed = pantryDraft.trim();
    if (!trimmed) return;

    setPantryItems(current => [trimmed, ...current]);
    setPantryDraft('');
  }

  function addPrepNote() {
    const trimmed = prepNote.trim();
    if (!trimmed) return;

    upsertNotification('Prep note saved', trimmed.slice(0, 42));
    setPrepNote('');
  }

  return (
    <div className="tab-stack nutrition-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Nutrition</p>
            <h2>Today&apos;s fuel</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Planned</span>
            <strong>{slotCoverage.planned}</strong>
          </div>
          <div className="summary-tile">
            <span>Logged</span>
            <strong>{slotCoverage.logged}</strong>
          </div>
          <div className="summary-tile">
            <span>Water</span>
            <strong>{hydrationCount}</strong>
          </div>
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
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Today&apos;s meals</p>
            <h2>Planned vs logged by slot</h2>
          </div>
        </div>

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
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Hydration</p>
            <h2>Keep water visible</h2>
          </div>
          <strong>{hydrationCount} cups</strong>
        </div>

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
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Meal planning</p>
            <h2>Edit today&apos;s plan</h2>
          </div>
          <button type="button" className="primary-button" onClick={savePlan}>
            Save plan
          </button>
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
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Pantry</p>
            <h2>Lightweight visibility</h2>
          </div>
        </div>

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
            <span key={item} className="status-pill">
              {item}
            </span>
          ))}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Macros / prep</p>
            <h2>Keep it simple</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Protein</span>
            <strong>{macroSummary.protein}</strong>
          </div>
          <div className="summary-tile">
            <span>Carbs</span>
            <strong>{macroSummary.carbs}</strong>
          </div>
          <div className="summary-tile">
            <span>Veg</span>
            <strong>{macroSummary.veg}</strong>
          </div>
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
      </section>
    </div>
  );
}

function FitnessScreen({ now, activeWorkoutId, onStartWorkout }) {
  const { workouts, notes, setWorkouts, setNotifications, createNotification } = useTaskContext();
  const { energyState, setEnergyState } = useAppContext();
  const [activeSubTab, setActiveSubTab] = useState('today');
  const [selectedProgramId, setSelectedProgramId] = useState(() => getWorkoutProgramKey(workouts[0]) || 'strength');
  const [selectedFrequency, setSelectedFrequency] = useState(() => (workouts[0]?.frequency === '5-day' ? '5-day' : '4-day'));
  const [programAnchor, setProgramAnchor] = useState(() => (FITNESS_ANCHORS.includes(workouts[0]?.anchorDay) ? workouts[0].anchorDay : 'Monday'));
  const [programStartDate, setProgramStartDate] = useState(() => alignDateToAnchor(now, programAnchor));
  const [checkInDraft, setCheckInDraft] = useState(() => ({
    mood: energyState.mood || 'steady',
    energy: Number.isFinite(energyState.value) ? energyState.value : 3,
    sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
  }));
  const [acceptedRecovery, setAcceptedRecovery] = useState(false);

  useEffect(() => {
    setProgramStartDate(alignDateToAnchor(now, programAnchor));
  }, [programAnchor]);

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

  const activeProgramId = activeWorkout ? getWorkoutProgramKey(activeWorkout) : selectedProgramId;
  const activeProgram = FITNESS_PROGRAMS[activeProgramId] || FITNESS_PROGRAMS.strength;
  const weeklyStats = useMemo(() => getWorkoutStats(workouts, now, selectedProgramId), [workouts, now, selectedProgramId]);
  const programWeek = Math.max(1, Math.floor((startOfDay(now).getTime() - programStartDate.getTime()) / 86_400_000 / 7) + 1);
  const programPhase = getProgramPhase(programWeek);
  const programGoalDate = useMemo(() => {
    if (activeProgramId === 'hyrox') return addDays(programStartDate, 42);
    if (activeProgramId === 'running') return addDays(programStartDate, 28);
    return null;
  }, [activeProgramId, programStartDate]);
  const programCountdown = programGoalDate ? formatCountdown(programGoalDate, now) : null;
  const weeklySchedule = useMemo(
    () => buildWeeklySchedule(activeProgram, selectedFrequency, programAnchor, now),
    [activeProgram, now, programAnchor, selectedFrequency],
  );
  const programOptions = useMemo(
    () => FITNESS_PROGRAM_ORDER.map(programId => FITNESS_PROGRAMS[programId]).filter(Boolean),
    [],
  );
  const programLibrary = useMemo(
    () => FITNESS_PROGRAM_ORDER.map(programId => ({
      program: FITNESS_PROGRAMS[programId],
      workouts: workouts.filter(workout => getWorkoutProgramKey(workout) === programId),
    })),
    [workouts],
  );
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
  const currentWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    return workouts.find(workout => getWorkoutProgramKey(workout) === selectedProgramId && workout.status !== 'completed')
      ?? workouts.find(workout => workout.status !== 'completed')
      ?? workouts[0]
      ?? null;
  }, [activeWorkout, workouts, selectedProgramId]);

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function startWorkout(workoutId) {
    const workout = workouts.find(item => item.id === workoutId);
    if (workout) {
      const workoutProgramId = getWorkoutProgramKey(workout);
      setSelectedProgramId(workoutProgramId);
      setSelectedFrequency(workout.frequency === '5-day' ? '5-day' : '4-day');
      if (FITNESS_ANCHORS.includes(workout.anchorDay)) {
        setProgramAnchor(workout.anchorDay);
      }
    }

    onStartWorkout(workoutId);
    setWorkouts(current => current.map(workout => (
      workout.id === workoutId
        ? {
            ...workout,
            status: 'active',
            type: getWorkoutProgramKey(workout),
            programId: getWorkoutProgramKey(workout),
            programName: FITNESS_PROGRAMS[getWorkoutProgramKey(workout)]?.name || workout.programName,
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
    setSelectedProgramId('recovery');
    setAcceptedRecovery(true);
    upsertNotification('Recovery accepted', 'Today is now recovery-first.');
  }

  function cycleProgram(direction = 1) {
    const currentIndex = FITNESS_PROGRAM_ORDER.indexOf(selectedProgramId);
    const nextIndex = (currentIndex + direction + FITNESS_PROGRAM_ORDER.length) % FITNESS_PROGRAM_ORDER.length;
    setSelectedProgramId(FITNESS_PROGRAM_ORDER[nextIndex]);
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
            <h2>{activeProgram.name} program</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => cycleProgram(1)}>
            Change
          </button>
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

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Today&apos;s workout</p>
                <h2>{currentWorkout?.name || 'No workout yet'}</h2>
              </div>
            </div>
            {currentWorkout ? (
              <article className="feed-card">
                <strong>{currentWorkout.name}</strong>
                <p>{FITNESS_PROGRAMS[getWorkoutProgramKey(currentWorkout)]?.name || currentWorkout.programName || 'Workout'} · {currentWorkout.duration} min · {currentWorkout.status}</p>
                <p>Week {programWeek} · {programPhase}</p>
                <button type="button" className="secondary-button" onClick={() => startWorkout(currentWorkout.id)}>
                  {activeWorkout ? 'Continue Workout' : 'Start Workout'}
                </button>
              </article>
            ) : (
              <div className="empty-panel">
                <strong>No workout exists yet</strong>
                <p>Add one with quick capture or from the library.</p>
              </div>
            )}
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Weekly stats</p>
                <h2>Training progress and trend</h2>
              </div>
            </div>
            <div className="summary-row fitness-stats-row">
              <div className="summary-tile">
                <span>Workouts completed</span>
                <strong>{weeklyStats.workoutsCompleted}</strong>
              </div>
              <div className="summary-tile">
                <span>Miles completed</span>
                <strong>{weeklyStats.milesCompleted.toFixed(1)}</strong>
              </div>
              <div className="summary-tile">
                <span>Strength sessions</span>
                <strong>{weeklyStats.strengthSessions}</strong>
              </div>
              <div className="summary-tile">
                <span>Recovery sessions</span>
                <strong>{weeklyStats.recoverySessions}</strong>
              </div>
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
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Active program</p>
                <h2>{activeProgram.name}</h2>
              </div>
              <button type="button" className="ghost-button compact-ghost" onClick={() => cycleProgram(1)}>
                Change
              </button>
            </div>
            <p className="empty-message">{activeProgram.description}</p>
            <div className="tag-row">
              {activeProgram.tags.map(tag => (
                <span key={tag} className="status-chip is-active">{tag}</span>
              ))}
            </div>
            <div className="summary-row">
              <div className="summary-tile">
                <span>Current week</span>
                <strong>{programWeek}</strong>
              </div>
              <div className="summary-tile">
                <span>Current phase</span>
                <strong>{programPhase}</strong>
              </div>
              <div className="summary-tile">
                <span>Frequency</span>
                <strong>{selectedFrequency}</strong>
              </div>
            </div>
          </section>

          {activeProgram.goalLabel && (
            <section className="task-card">
              <div className="task-card-header">
                <div>
                  <p className="eyebrow">Goal card</p>
                  <h2>{activeProgram.goalLabel}</h2>
                </div>
              </div>
              <div className="summary-row">
                <div className="summary-tile">
                  <span>Anchor</span>
                  <strong>{programAnchor}</strong>
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
                {activeProgram.countdownLabel ? `${activeProgram.countdownLabel}: ${programCountdown || 'Not set'}` : 'No race countdown for this program yet.'}
              </p>
            </section>
          )}

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Training controls</p>
                <h2>Frequency and anchor</h2>
              </div>
            </div>
            <div className="segmented-control">
              {FITNESS_FREQUENCIES.map(frequency => (
                <button
                  key={frequency}
                  type="button"
                  className={`status-chip ${selectedFrequency === frequency ? 'is-active' : ''}`}
                  onClick={() => setSelectedFrequency(frequency)}
                >
                  {frequency}
                </button>
              ))}
            </div>
            <div className="segmented-control">
              {FITNESS_ANCHORS.map(anchor => (
                <button
                  key={anchor}
                  type="button"
                  className={`status-chip ${programAnchor === anchor ? 'is-active' : ''}`}
                  onClick={() => setProgramAnchor(anchor)}
                >
                  {anchor}
                </button>
              ))}
            </div>
            <div className="tag-row">
              {programOptions.map(program => (
                <button
                  key={program.id}
                  type="button"
                  className={`status-chip ${selectedProgramId === program.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedProgramId(program.id)}
                >
                  {program.name}
                </button>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Weekly schedule</p>
                <h2>Program week layout</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {weeklySchedule.map(session => (
                <article key={`${session.title}-${session.offset}`} className="feed-card">
                  <strong>{session.dayLabel} · {session.title}</strong>
                  <p>{session.dateLabel} · {session.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'library' && (
        <>
          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Workout library</p>
                <h2>Program-first templates</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {programLibrary.map(({ program, workouts: programWorkouts }) => (
                <article key={program.id} className="feed-card">
                  <strong>{program.name}</strong>
                  <p>{program.description}</p>
                  <p>{programWorkouts.length} saved workouts</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Saved workouts</p>
                <h2>Templates and finishes</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {programLibrary.some(entry => entry.workouts.length > 0) ? (
                programLibrary.map(({ program, workouts: programWorkouts }) => (
                  programWorkouts.length === 0 ? null : (
                    <article key={`${program.id}-saved`} className="feed-card">
                      <strong>{program.name}</strong>
                      <p>{programWorkouts.map(workout => workout.name).join(' · ')}</p>
                      <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedProgramId(program.id)}>
                        View program
                      </button>
                    </article>
                  )
                ))
              ) : (
                <div className="empty-panel">
                  <strong>No saved workouts yet</strong>
                  <p>Program templates will show up here as workouts are captured.</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {activeSubTab === 'logging' && (
        <>
          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Logging</p>
                <h2>Lightweight and expandable</h2>
              </div>
            </div>
            <div className="summary-row">
              <div className="summary-tile"><span>Workouts</span><strong>{workoutLogs.length}</strong></div>
              <div className="summary-tile"><span>Runs</span><strong>{runLogs.length}</strong></div>
              <div className="summary-tile"><span>Strength</span><strong>{strengthLogs.length}</strong></div>
              <div className="summary-tile"><span>Recovery</span><strong>{recoveryLogs.length}</strong></div>
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Workouts</p>
                <h2>Session history</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {workoutLogs.slice(0, 3).map(workout => (
                <article key={workout.id} className="feed-card">
                  <strong>{workout.name}</strong>
                  <p>{workout.duration} min · {workout.status}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Runs</p>
                <h2>Distance or speed notes</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {runLogs.slice(0, 3).map(workout => (
                <article key={workout.id} className="feed-card">
                  <strong>{workout.name}</strong>
                  <p>{workout.distanceMiles ? `${workout.distanceMiles.toFixed(1)} miles` : `${workout.duration} min`} · {workout.status}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Strength</p>
                <h2>Load and volume placeholders</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {strengthLogs.slice(0, 3).map(workout => (
                <article key={workout.id} className="feed-card">
                  <strong>{workout.name}</strong>
                  <p>{workout.programName || 'Strength'} · {workout.status}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Recovery</p>
                <h2>Downshift sessions</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {recoveryLogs.slice(0, 3).map(workout => (
                <article key={workout.id} className="feed-card">
                  <strong>{workout.name}</strong>
                  <p>{workout.programName || 'Recovery'} · {workout.status}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card">
            <div className="task-card-header">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>Quick log entry</h2>
              </div>
            </div>
            <div className="subtle-feed">
              {notes.slice(0, 3).map(note => (
                <article key={note.id} className="feed-card">
                  <strong>{note.content}</strong>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MoreScreen({ now }) {
  const { tasks, meals, notes, workouts, notifications } = useTaskContext();
  const { energyState } = useAppContext();
  const weekStart = useMemo(() => alignDateToAnchor(now, 'Monday'), [now]);
  const nextWeekStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const previousWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const nextMonthStart = useMemo(() => startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)), [now]);
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const activeWorkout = workouts.find(workout => workout.status === 'active') ?? null;
  const latestWorkout = workouts[0] ?? null;
  const activeProgramId = activeWorkout ? getWorkoutProgramKey(activeWorkout) : getWorkoutProgramKey(latestWorkout);
  const activeProgram = FITNESS_PROGRAMS[activeProgramId] || FITNESS_PROGRAMS.strength;

  const weeklyInsights = useMemo(() => {
    const weekTasks = tasks.filter(task => isWithinRange(task.createdAt, weekStart, nextWeekStart));
    const previousWeekTasks = tasks.filter(task => isWithinRange(task.createdAt, previousWeekStart, weekStart));
    const weekWorkouts = workouts.filter(workout => isWithinRange(workout.createdAt, weekStart, nextWeekStart));
    const previousWeekWorkouts = workouts.filter(workout => isWithinRange(workout.createdAt, previousWeekStart, weekStart));
    const weekMeals = meals.filter(meal => isWithinRange(meal.loggedAt, weekStart, nextWeekStart));
    const previousWeekMeals = meals.filter(meal => isWithinRange(meal.loggedAt, previousWeekStart, weekStart));

    const completedTasks = weekTasks.filter(task => task.status === 'done').length;
    const completedWorkouts = weekWorkouts.filter(workout => workout.status === 'completed').length;
    const mealsLogged = weekMeals.length;
    const hydrationCount = weekMeals.filter(isHydrationMeal).length;
    const hydrationTrend = hydrationCount - previousWeekMeals.filter(isHydrationMeal).length;
    const taskTrend = completedTasks - previousWeekTasks.filter(task => task.status === 'done').length;
    const workoutTrend = completedWorkouts - previousWeekWorkouts.filter(workout => workout.status === 'completed').length;

    return {
      completedTasks,
      completedWorkouts,
      mealsLogged,
      hydrationCount,
      hydrationTrend,
      taskTrend,
      workoutTrend,
    };
  }, [meals, nextWeekStart, previousWeekStart, tasks, weekStart, workouts]);

  const fitnessSummary = useMemo(() => getWorkoutStats(workouts, now, activeProgramId), [activeProgramId, now, workouts]);
  const dailyTaskSummary = useMemo(() => {
    const active = tasks.filter(task => task.status === 'active');
    const planned = tasks.filter(task => task.status === 'planned');
    const completedToday = tasks.filter(task => task.status === 'done' && sameDay(task.createdAt, now));

    return {
      active,
      planned,
      completedToday,
    };
  }, [now, tasks]);

  const monthlyTaskSummary = useMemo(() => {
    const monthTasks = tasks.filter(task => isWithinRange(task.createdAt, monthStart, nextMonthStart));
    return {
      total: monthTasks.length,
      active: monthTasks.filter(task => task.status === 'active').length,
      planned: monthTasks.filter(task => task.status === 'planned').length,
      done: monthTasks.filter(task => task.status === 'done').length,
      preview: monthTasks.slice(0, 2),
    };
  }, [monthStart, nextMonthStart, tasks]);

  const noteSummary = useMemo(() => {
    const monthNotes = notes.filter(note => isWithinRange(note.createdAt, monthStart, nextMonthStart));
    return {
      latest: notes[0] ?? null,
      monthCount: monthNotes.length,
      preview: notes.slice(0, 2),
    };
  }, [monthStart, nextMonthStart, notes]);

  const systemSummary = useMemo(() => {
    const source =
      energyState.sleepSource === 'integrated'
        ? 'Integrated'
        : energyState.sleepSource === 'manual'
          ? 'Manual'
          : energyState.sleepSource === 'last known'
            ? 'Last known'
            : 'Baseline';

    return {
      energy: Number.isFinite(energyState.value) ? energyState.value : 3,
      sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
      source,
      lastCheckIn: energyState.lastCheckIn ? formatShortMonthDay(energyState.lastCheckIn) : 'No check-in yet',
    };
  }, [energyState.lastCheckIn, energyState.sleepHours, energyState.sleepSource, energyState.value]);

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">More</p>
            <h2>Summary and insights</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Tasks done</span>
            <strong>{weeklyInsights.completedTasks}</strong>
          </div>
          <div className="summary-tile">
            <span>Workouts</span>
            <strong>{weeklyInsights.completedWorkouts}</strong>
          </div>
          <div className="summary-tile">
            <span>Meals</span>
            <strong>{weeklyInsights.mealsLogged}</strong>
          </div>
          <div className="summary-tile">
            <span>Hydration</span>
            <strong>{weeklyInsights.hydrationCount}</strong>
          </div>
        </div>

        <p className="empty-message">
          Trend: {weeklyInsights.taskTrend >= 0 ? '+' : ''}{weeklyInsights.taskTrend} tasks, {weeklyInsights.workoutTrend >= 0 ? '+' : ''}{weeklyInsights.workoutTrend} workouts, hydration {weeklyInsights.hydrationTrend >= 0 ? '+' : ''}{weeklyInsights.hydrationTrend} versus last week.
        </p>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Fitness summary</p>
            <h2>Current program rollup</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Program</span>
            <strong>{activeProgram.name}</strong>
          </div>
          <div className="summary-tile">
            <span>Workouts</span>
            <strong>{fitnessSummary.workoutsCompleted}</strong>
          </div>
          <div className="summary-tile">
            <span>Miles</span>
            <strong>{fitnessSummary.milesCompleted.toFixed(1)}</strong>
          </div>
          <div className="summary-tile">
            <span>Recovery</span>
            <strong>{fitnessSummary.recoverySessions}</strong>
          </div>
        </div>

        <p className="empty-message">
          Program focus: {activeProgram.description}
        </p>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Daily tasks</p>
            <h2>Current task state</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Active</span>
            <strong>{dailyTaskSummary.active.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Planned</span>
            <strong>{dailyTaskSummary.planned.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Done today</span>
            <strong>{dailyTaskSummary.completedToday.length}</strong>
          </div>
        </div>

        <div className="subtle-feed">
          {dailyTaskSummary.active.length === 0 && dailyTaskSummary.planned.length === 0 ? (
            <div className="empty-panel">
              <strong>No tasks in motion</strong>
              <p>Capture one from the top bar or keep this as a clean slate.</p>
            </div>
          ) : (
            [...dailyTaskSummary.active, ...dailyTaskSummary.planned].slice(0, 2).map(task => (
              <article key={task.id} className="feed-card">
                <strong>{task.title || 'Untitled task'}</strong>
                <p>{task.status} · {task.subtasks.filter(subtask => subtask.done === false).length} open subtasks</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Monthly tasks</p>
            <h2>Lightweight month rollup</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>This month</span>
            <strong>{monthlyTaskSummary.total}</strong>
          </div>
          <div className="summary-tile">
            <span>Active</span>
            <strong>{monthlyTaskSummary.active}</strong>
          </div>
          <div className="summary-tile">
            <span>Done</span>
            <strong>{monthlyTaskSummary.done}</strong>
          </div>
        </div>

        <div className="subtle-feed">
          {monthlyTaskSummary.preview.length === 0 ? (
            <div className="empty-panel">
              <strong>No month-level task data yet</strong>
              <p>New tasks will start filling this rollup automatically.</p>
            </div>
          ) : (
            monthlyTaskSummary.preview.map(task => (
              <article key={task.id} className="feed-card">
                <strong>{task.title || 'Untitled task'}</strong>
                <p>{task.status} · created {formatShortMonthDay(task.createdAt)}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Notes rollup</p>
            <h2>Preview only</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Notes</span>
            <strong>{notes.length}</strong>
          </div>
          <div className="summary-tile">
            <span>This month</span>
            <strong>{noteSummary.monthCount}</strong>
          </div>
          <div className="summary-tile">
            <span>Unread</span>
            <strong>{unreadCount}</strong>
          </div>
        </div>

        <div className="subtle-feed">
          {noteSummary.preview.length > 0 ? (
            noteSummary.preview.map(note => (
              <article key={note.id} className="feed-card">
                <strong>{note.content}</strong>
                <p>{formatShortMonthDay(note.createdAt)}</p>
              </article>
            ))
          ) : (
            <div className="empty-panel">
              <strong>No notes captured yet</strong>
              <p>Notes roll up here once they exist; nothing else is managed here.</p>
            </div>
          )}
          {noteSummary.latest && (
            <p className="empty-message">
              Latest note: {noteSummary.latest.content.slice(0, 60)}
            </p>
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">System summary</p>
            <h2>Quick state check</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Energy</span>
            <strong>{systemSummary.energy}/5</strong>
          </div>
          <div className="summary-tile">
            <span>Sleep</span>
            <strong>{systemSummary.sleepHours}h</strong>
          </div>
          <div className="summary-tile">
            <span>Inbox</span>
            <strong>{unreadCount}</strong>
          </div>
        </div>

        <p className="empty-message">
          Source: {systemSummary.source} · last check-in {systemSummary.lastCheckIn}
        </p>
      </section>
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
  } = useTaskContext();
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationCenterOpen,
    setNotificationCenterOpen,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [weeklyItems, setWeeklyItems] = useState(() => createCalendarSeed());

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

  return (
    <div className="app-shell">
      <Header
        userName="Alex"
        inboxCount={unreadNotifications.length}
        onOpenInbox={() => setNotificationCenterOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <button
        type="button"
        className="fab-button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="Open quick capture"
      >
        +
      </button>

      <main className="app-content">
        <div className="tab-stack">
          <RootTabPanel id="dashboard" activeTab={activeTab}>
            <DashboardScreen
              inboxCount={unreadNotifications.length}
              now={now}
              activeWorkoutId={activeWorkoutId}
              onStartWorkout={setActiveWorkoutId}
              calendarItems={weeklyItems}
            />
          </RootTabPanel>

          <RootTabPanel id="calendar" activeTab={activeTab}>
            <CalendarScreen weeklyItems={weeklyItems} setWeeklyItems={setWeeklyItems} />
          </RootTabPanel>

          <RootTabPanel id="nutrition" activeTab={activeTab}>
            <NutritionScreen now={now} />
          </RootTabPanel>

          <RootTabPanel id="fitness" activeTab={activeTab}>
            <FitnessScreen now={now} activeWorkoutId={activeWorkoutId} onStartWorkout={setActiveWorkoutId} />
          </RootTabPanel>

          <RootTabPanel id="more" activeTab={activeTab}>
            <MoreScreen now={now} />
          </RootTabPanel>
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

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
    </div>
  );
}

function App() {
  return (
    <TaskProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </TaskProvider>
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
