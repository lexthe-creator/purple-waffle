import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppFrame from './components/AppFrame.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import WeeklyPreview from './components/WeeklyPreview.jsx';
import InboxView from './views/InboxView.jsx';
import FinanceScreen from './views/FinanceScreen.jsx';
import HomeScreen from './views/HomeScreen.jsx';
import MorningCheckinModal from './components/MorningCheckinModal.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
import { ProfileProvider } from './context/ProfileContext.jsx';
import { ALL_STATIONS, getPhaseForWeek, getWeeklyTemplate } from './data/hyroxPlan.js';
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
    id: 'finance',
    label: 'Finance',
    iconPath: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  },
  {
    id: 'home',
    label: 'Home',
    iconPath: '<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5Z"/><polyline points="9 21 9 12 15 12 15 21"/>',
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

// Builds a program-compatible HYROX object for the given 1-based week number.
// Uses A/B alternation (odd=A, even=B) and derives phase description from the
// 32-week plan so existing helpers (buildWeeklySchedule, etc.) work unchanged.
function buildHyroxProgramForWeek(weekNumber) {
  const weekType = weekNumber % 2 === 1 ? 'A' : 'B';
  const phase = getPhaseForWeek(weekNumber);
  return {
    id: 'hyrox',
    name: 'HYROX',
    description: phase.description,
    tags: ['Race prep', 'Hybrid', 'Engine'],
    goalLabel: 'Race build',
    countdownLabel: 'Race countdown',
    weekType,
    schedules: {
      '4-day': getWeeklyTemplate({ trainingDays: '4-day', weekType, weekNumber }),
      '5-day': getWeeklyTemplate({ trainingDays: '5-day', weekType, weekNumber }),
    },
  };
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

// Returns the program template session for a given date, or null if it's a rest day.
function getSessionForDate(program, frequency, anchorDay, date) {
  const schedule = buildWeeklySchedule(program, frequency, anchorDay, date);
  const dateKey = toDateKey(date);
  return schedule.find(session => toDateKey(session.date) === dateKey) ?? null;
}

// Returns sessions from this week that are before today and have no matching completed workout.
function getMissedSessions(program, frequency, anchorDay, workouts, now) {
  const schedule = buildWeeklySchedule(program, frequency, anchorDay, now);
  const todayKey = toDateKey(now);

  return schedule.filter(session => {
    const sessionKey = toDateKey(session.date);
    if (sessionKey >= todayKey) return false;

    const hasCompleted = workouts.some(
      w =>
        w.scheduledDate === sessionKey &&
        w.status === 'completed' &&
        (w.programId === program.id || w.sessionOffset === session.offset),
    );
    return !hasCompleted;
  });
}

// Returns the next training day date string (YYYY-MM-DD) after a given date.
function getNextTrainingDate(program, frequency, anchorDay, afterDate) {
  const afterKey = toDateKey(afterDate);
  const currentWeekSchedule = buildWeeklySchedule(program, frequency, anchorDay, afterDate);
  const laterThisWeek = currentWeekSchedule.find(s => toDateKey(s.date) > afterKey);
  if (laterThisWeek) return toDateKey(laterThisWeek.date);

  const nextWeekStart = addDays(afterDate, 7);
  const nextWeekSchedule = buildWeeklySchedule(program, frequency, anchorDay, nextWeekStart);
  return nextWeekSchedule.length > 0 ? toDateKey(nextWeekSchedule[0].date) : null;
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

function DashboardScreen({ inboxCount, now, activeWorkoutId, onStartWorkout, onSwitchToCalendar, onSwitchToFitness, weeklyItems }) {
  const { tasks, setTasks, meals, notes, workouts, createTask, createSubtask, habits, setHabits } = useTaskContext();
  const { planningMode, setPlanningMode, morningChecklist, setMorningChecklist, energyState, setQuickAddOpen, setShowMorningCheckin } = useAppContext();
  const [executionExpanded, setExecutionExpanded] = useState(true);
  const [priorityExpanded, setPriorityExpanded] = useState(false);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [priorityMode, setPriorityMode] = useState(true);
  const [showCompleteAllConfirm, setShowCompleteAllConfirm] = useState(false);
  const [checklistHidden, setChecklistHidden] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const checklistRef = useRef(null);
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

  const activeTasks = useMemo(() => orderedTasks.filter(t => t.status !== 'done'), [orderedTasks]);

  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );

  const activeWorkout = useMemo(() => {
    if (!activeWorkoutId) return null;
    return workouts.find(w => w.id === activeWorkoutId) ?? null;
  }, [activeWorkoutId, workouts]);

  const nextWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    return workouts.find(w => w.status !== 'completed') ?? workouts[0] ?? null;
  }, [activeWorkout, workouts]);

  const todayHabits = useMemo(
    () => habits.filter(h => h.frequency === 'daily' || h.frequency === 'weekly'),
    [habits],
  );

  const MAX_PRIORITIES = 5;
  const visiblePriorities = priorityExpanded ? activeTasks : activeTasks.slice(0, MAX_PRIORITIES);
  const priorityOverflow = Math.max(0, activeTasks.length - visiblePriorities.length);

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

  function toggleChecklistItem(id) {
    setMorningChecklist(prev =>
      prev.map(item => (item.id === id ? { ...item, done: !item.done } : item)),
    );
  }

  function scrollToChecklist() {
    checklistRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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

  function moveTask(taskId, direction) {
    preserveScroll(() => {
      setTasks(current => {
        const index = current.findIndex(t => t.id === taskId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        return next;
      });
    });
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

  function openExecutionComposer() {
    setExecutionExpanded(true);
    window.requestAnimationFrame(() => {
      const trigger = document.querySelector('.execution-list .inline-task-trigger');
      if (trigger) { trigger.click(); return; }
      document.querySelector('.execution-list .inline-task-input')?.focus();
    });
  }

  // ── Planning Mode ─────────────────────────────────────────────────────────
  if (planningMode) {
    return (
      <div className="tab-stack">
        <section className="task-card today-surface">

          {/* Header — clean, just greeting + date */}
          <div className="today-zone" ref={checklistRef}>
            <p className="eyebrow">{formatFullDate(now)}</p>
            <h2 style={{ margin: '2px 0 0' }}>{getGreeting(now)}</h2>
          </div>

          {/* GET TO FIRST VALUE card */}
          <div className="today-zone">
            <div className="gtfv-card">
              <div className="gtfv-header">
                <p className="eyebrow" style={{ margin: 0 }}>Get to first value</p>
                <button
                  type="button"
                  className="ghost-button compact-ghost"
                  onClick={() => setChecklistHidden(h => !h)}
                >
                  {checklistHidden ? 'Show' : 'Hide'}
                </button>
              </div>
              {!checklistHidden && (
                <>
                  <p className="gtfv-subtitle">Finish the setup loop once, then let the day run itself.</p>
                  <ul className="gtfv-list">
                    {morningChecklist.map(item => (
                      <li
                        key={item.id}
                        className={`gtfv-item${item.done ? ' is-done' : ''}`}
                        onClick={() => toggleChecklistItem(item.id)}
                      >
                        <span className={`gtfv-indicator${item.done ? ' is-checked' : ''}`}>
                          {item.done ? (
                            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <polyline points="1,6 4,10 11,2" />
                            </svg>
                          ) : '•'}
                        </span>
                        <span className="checklist-label">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          {/* DAILY EXECUTION — heading + pill + metric strip + priority list all in one zone */}
          <div className="today-zone">
            {/* Row 1: eyebrow + Planning pill */}
            <div className="daily-exec-header">
              <p className="eyebrow" style={{ margin: 0 }}>Daily Execution</p>
              <span className="mode-pill mode-pill--planning">Planning</span>
            </div>

            {/* Row 2: big heading + Quick Capture button */}
            <div className="daily-exec-title-row">
              <h2 className="daily-exec-heading">Plan first, execute once the list is real</h2>
              <button type="button" className="ghost-button compact-ghost" style={{ flexShrink: 0 }} onClick={() => setQuickAddOpen(true)}>
                Quick Capture
              </button>
            </div>

            {/* Subtext */}
            <p className="planning-subtext">{formatFullDate(now)} · selected date</p>
            <p className="planning-subtext" style={{ marginTop: 0 }}>Editable priorities with reorder and cleanup.</p>

            {/* Metric strip — lives below the heading */}
            <div className="ui-metrics-row" style={{ marginBottom: 12 }}>
              <MetricBlock value={energyState.value != null ? `${energyState.value}/5` : '—'} label="Energy" />
              <MetricBlock value={energyState.sleepHours != null ? `${energyState.sleepHours}h` : '—'} label="Sleep" />
              <MetricBlock value={inboxCount} label="Inbox" />
            </div>

            {/* Priority list */}
            {activeTasks.length === 0 ? (
              <EmptyState
                title="No priorities yet"
                description="Add the tasks that define the day."
              />
            ) : (
              <>
                {visiblePriorities.map(task => (
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
                  onStartDrag={startTaskDrag}
                  onMoveDrag={moveTaskDrag}
                  onEndDrag={endTaskDrag}
                  isDragging={draggingTaskId === task.id}
                  mode="planning"
                />
              ))}
              </>
            )}
            <InlineTaskComposer defaultPriority={priorityMode} onSubmit={addInlineTask} />
          </div>

          {/* Next meal card */}
          <div className="today-zone">
            <article className="contextual-card">
              <div className="contextual-card-header">
                <p className="contextual-card-eyebrow">Next meal</p>
                {todaysMeals.length === 0 ? (
                  <button type="button" className="ghost-button compact-ghost" onClick={() => setQuickAddOpen(true)}>Plan meal</button>
                ) : (
                  <button type="button" className="ghost-button compact-ghost" onClick={() => setQuickAddOpen(true)}>Add another</button>
                )}
              </div>
              {todaysMeals.length === 0 ? (
                <>
                  <strong className="contextual-card-title">Breakfast still open</strong>
                  <p className="contextual-card-subtitle">Use templates or quick logging</p>
                </>
              ) : (
                <>
                  <strong className="contextual-card-title">{todaysMeals[0].name}</strong>
                  {todaysMeals[0].tags.length > 0 && (
                    <p className="contextual-card-subtitle">{todaysMeals[0].tags.join(' · ')}</p>
                  )}
                </>
              )}
            </article>
          </div>

          {/* Today's workout card */}
          <div className="today-zone">
            <article className="contextual-card">
              <div className="contextual-card-header">
                <p className="contextual-card-eyebrow">Today&apos;s workout</p>
                {nextWorkout ? (
                  <button
                    type="button"
                    className="ghost-button compact-ghost"
                    onClick={() => { setPlanningMode(false); onStartWorkout(nextWorkout.id); }}
                  >
                    Start
                  </button>
                ) : (
                  <button type="button" className="ghost-button compact-ghost" onClick={() => setQuickAddOpen(true)}>Add workout</button>
                )}
              </div>
              {nextWorkout ? (
                <>
                  <strong className="contextual-card-title">{nextWorkout.name}</strong>
                  <p className="contextual-card-subtitle">{nextWorkout.duration} min · Planning only. No recovery prompt for future dates.</p>
                </>
              ) : (
                <strong className="contextual-card-title">No workout planned</strong>
              )}
            </article>
          </div>

          {/* Task flow card */}
          <div className="today-zone">
            <article className="contextual-card">
              <div className="contextual-card-header">
                <p className="contextual-card-eyebrow">Task flow</p>
              </div>
              {activeTasks.length > 0 ? (
                <strong className="contextual-card-title">{activeTasks.length} queued</strong>
              ) : (
                <>
                  <strong className="contextual-card-title">Nothing queued</strong>
                  <p className="contextual-card-subtitle">Capture or schedule a task</p>
                </>
              )}
            </article>
          </div>

          {/* Habits card */}
          <div className="today-zone">
            <article className="contextual-card">
              <div className="contextual-card-header">
                <p className="contextual-card-eyebrow">Habits</p>
              </div>
              {todayHabits.length === 0 ? (
                <strong className="contextual-card-title">No habits set up yet</strong>
              ) : (
                <ul className="gtfv-list">
                  {todayHabits.map(habit => {
                    const doneToday = habit.completedDates.includes(todayStr);
                    return (
                      <li
                        key={habit.id}
                        className={`gtfv-item${doneToday ? ' is-done' : ''}`}
                        onClick={() => toggleHabit(habit.id)}
                      >
                        <span className={`gtfv-indicator${doneToday ? ' is-checked' : ''}`}>
                          {doneToday ? (
                            <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                              <polyline points="1,6 4,10 11,2" />
                            </svg>
                          ) : '•'}
                        </span>
                        <span className="checklist-label">{habit.title}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </div>

        </section>

        {/* Planning toolbar */}
        <div className="dashboard-toolbar">
          <button type="button" className="ghost-button compact-ghost" onClick={() => setShowMorningCheckin(true)}>
            Morning check-in
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setQuickAddOpen(true)}>
            Brain Dump
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setPlanningMode(false)}>
            Move to Execution
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={onSwitchToCalendar}>
            Open Calendar
          </button>
        </div>
      </div>
    );
  }

  // ── Execution Mode ────────────────────────────────────────────────────────
  // Hierarchy: date orientation → today agenda → fitness state → top tasks → supporting metrics
  return (
    <div className="tab-stack">
      <section className="task-card today-surface">

        {/* 1. Date + quick orientation */}
        <div className="today-zone">
          <div className="planning-header">
            <div>
              <p className="eyebrow">{formatFullDate(now)}</p>
              <h2>{getGreeting(now)}</h2>
            </div>
            <div className="planning-header-actions">
              <span className="mode-pill mode-pill--execution">Execution</span>
              <button type="button" className="ghost-button compact-ghost" onClick={() => setPlanningMode(true)}>
                Back to Planning
              </button>
            </div>
          </div>
        </div>

        {/* 2. Today agenda — what's scheduled right now */}
        <div className="today-zone">
          <ExpandablePanel
            defaultOpen
            header={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p className="eyebrow" style={{ margin: 0 }}>Today&apos;s agenda</p>
              </div>
            }
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

        {/* 3. Fitness state — active workout or next session */}
        <div className="today-zone">
          {activeWorkout ? (
            <button type="button" className="active-workout-banner" onClick={onSwitchToFitness}>
              <span>{activeWorkout.name} in progress</span>
              <span className="active-workout-banner-cta">Tap to return →</span>
            </button>
          ) : nextWorkout ? (
            <article className="contextual-card">
              <div className="contextual-card-header">
                <p className="contextual-card-eyebrow">Fitness</p>
                <button
                  type="button"
                  className="ghost-button compact-ghost"
                  onClick={() => { onStartWorkout(nextWorkout.id); }}
                >
                  Start
                </button>
              </div>
              <strong className="contextual-card-title">{nextWorkout.name}</strong>
              <p className="contextual-card-subtitle">{nextWorkout.duration} min</p>
            </article>
          ) : null}
        </div>

        {/* 4. Top tasks — the execution list */}
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

        {/* 5. Habits — tap to check off */}
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

        {/* 6. Supporting metrics — recovery signals, collapsed by default */}
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

      {/* Execution toolbar */}
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
        <button type="button" className="ghost-button compact-ghost" onClick={() => setPlanningMode(true)}>
          Back to Planning
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
  const [selectedFrequency, setSelectedFrequency] = useState(() => fitnessSettings.selectedFrequency || '4-day');
  const [programAnchor, setProgramAnchor] = useState(() => fitnessSettings.programAnchor || 'Monday');
  const [checkInDraft, setCheckInDraft] = useState(() => ({
    mood: energyState.mood || 'steady',
    energy: Number.isFinite(energyState.value) ? energyState.value : 3,
    sleepHours: Number.isFinite(energyState.sleepHours) ? energyState.sleepHours : 7,
  }));
  const [acceptedRecovery, setAcceptedRecovery] = useState(false);
  const [acknowledgedMisses, setAcknowledgedMisses] = useState(() => new Set());

  // programStartDate: persisted in fitnessSettings, falls back to current anchor week start
  const programStartDate = useMemo(() => {
    const saved = fitnessSettings.programStartDate;
    if (saved && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return new Date(`${saved}T00:00:00`);
    return alignDateToAnchor(now, programAnchor);
  }, [fitnessSettings.programStartDate, programAnchor, now]);

  // Persist fitness settings back to AppContext whenever they change
  useEffect(() => {
    setFitnessSettings(current => ({
      ...current,
      programType: 'hyrox',
      selectedFrequency,
      programAnchor,
      programStartDate: toDateKey(alignDateToAnchor(now, programAnchor)),
    }));
  }, [selectedFrequency, programAnchor]);

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
  const programWeek = Math.max(1, Math.floor((startOfDay(now).getTime() - programStartDate.getTime()) / 86_400_000 / 7) + 1);
  const programPhase = getPhaseForWeek(programWeek).name;
  const activeProgram = useMemo(() => buildHyroxProgramForWeek(programWeek), [programWeek]);
  const weeklyStats = useMemo(() => getWorkoutStats(workouts, now, 'hyrox'), [workouts, now]);
  const programGoalDate = useMemo(() => addDays(programStartDate, 224), [programStartDate]);
  const programCountdown = programGoalDate ? formatCountdown(programGoalDate, now) : null;
  const weeklySchedule = useMemo(
    () => buildWeeklySchedule(activeProgram, selectedFrequency, programAnchor, now),
    [activeProgram, now, programAnchor, selectedFrequency],
  );
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

  // Today's scheduled session from the program template
  const todaySession = useMemo(
    () => getSessionForDate(activeProgram, selectedFrequency, programAnchor, now),
    [activeProgram, selectedFrequency, programAnchor, now],
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
    () => getMissedSessions(activeProgram, selectedFrequency, programAnchor, workouts, now),
    [activeProgram, selectedFrequency, programAnchor, workouts, now],
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
    const workout = workouts.find(item => item.id === workoutId);
    if (workout) {
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
      frequency: selectedFrequency,
      anchorDay: programAnchor,
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
    const nextDate = getNextTrainingDate(activeProgram, selectedFrequency, programAnchor, session.date);
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
      frequency: selectedFrequency,
      anchorDay: programAnchor,
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
                <p>{activeProgram.name} · {todaySession.detail}</p>
                <p>Week {programWeek} · {programPhase} · {selectedFrequency}</p>
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
            <SectionHeader eyebrow="Active program" title={activeProgram.name} />
            <p className="empty-message">{activeProgram.description}</p>
            <div className="tag-row">
              {activeProgram.tags.map(tag => (
                <span key={tag} className="status-chip is-active">{tag}</span>
              ))}
            </div>
            <div className="ui-metrics-row">
              <MetricBlock value={programWeek} label="Current week" />
              <MetricBlock value={programPhase} label="Current phase" />
              <MetricBlock value={`Week ${activeProgram.weekType}`} label="Week type" />
              <MetricBlock value={selectedFrequency} label="Frequency" />
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
          </section>

          <section className="task-card">
            <SectionHeader eyebrow="Weekly schedule" title="Program week layout" />
            <div className="subtle-feed">
              {weeklySchedule.map(session => {
                const sessionKey = toDateKey(session.date);
                const isDone = completedScheduledDates.has(sessionKey);
                const isToday = sessionKey === todayKey;
                return (
                  <ListRow
                    key={`${session.title}-${session.offset}`}
                    variant="card"
                    label={`${isDone ? '✓ ' : isToday ? '→ ' : ''}${session.dayLabel} · ${session.title}`}
                    sub={`${session.dateLabel} · ${session.detail}`}
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

function MoreScreen({ now }) {
  const { tasks, meals, notes, workouts, notifications } = useTaskContext();
  const { energyState } = useAppContext();
  const weekStart = useMemo(() => alignDateToAnchor(now, 'Monday'), [now]);
  const nextWeekStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const previousWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);
  const nextMonthStart = useMemo(() => startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)), [now]);
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const activeProgram = { name: 'HYROX', description: '32-week race preparation with stations, running, and hybrid sessions.' };

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

  const fitnessSummary = useMemo(() => getWorkoutStats(workouts, now, 'hyrox'), [now, workouts]);
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
      <Card>
        <SectionHeader eyebrow="More" title="Summary and insights" />
        <div className="ui-metrics-row">
          <MetricBlock
            value={weeklyInsights.completedTasks}
            label="Tasks done"
            trend={weeklyInsights.taskTrend !== 0 ? `${weeklyInsights.taskTrend >= 0 ? '+' : ''}${weeklyInsights.taskTrend} vs last wk` : undefined}
            trendDir={weeklyInsights.taskTrend < 0 ? 'down' : 'up'}
          />
          <MetricBlock
            value={weeklyInsights.completedWorkouts}
            label="Workouts"
            trend={weeklyInsights.workoutTrend !== 0 ? `${weeklyInsights.workoutTrend >= 0 ? '+' : ''}${weeklyInsights.workoutTrend}` : undefined}
            trendDir={weeklyInsights.workoutTrend < 0 ? 'down' : 'up'}
          />
          <MetricBlock value={weeklyInsights.mealsLogged} label="Meals" />
          <MetricBlock
            value={weeklyInsights.hydrationCount}
            label="Hydration"
            trend={weeklyInsights.hydrationTrend !== 0 ? `${weeklyInsights.hydrationTrend >= 0 ? '+' : ''}${weeklyInsights.hydrationTrend}` : undefined}
            trendDir={weeklyInsights.hydrationTrend < 0 ? 'down' : 'up'}
          />
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Fitness summary" title="Current program rollup" />
        <div className="ui-metrics-row">
          <MetricBlock value={activeProgram.name} label="Program" />
          <MetricBlock value={fitnessSummary.workoutsCompleted} label="Workouts" />
          <MetricBlock value={fitnessSummary.milesCompleted.toFixed(1)} label="Miles" />
          <MetricBlock value={fitnessSummary.recoverySessions} label="Recovery" />
        </div>
        <p className="empty-message">Program focus: {activeProgram.description}</p>
      </Card>

      <Card>
        <SectionHeader eyebrow="Daily tasks" title="Current task state" />
        <div className="ui-metrics-row">
          <MetricBlock value={dailyTaskSummary.active.length} label="Active" />
          <MetricBlock value={dailyTaskSummary.planned.length} label="Planned" />
          <MetricBlock value={dailyTaskSummary.completedToday.length} label="Done today" />
        </div>
        <div className="subtle-feed">
          {dailyTaskSummary.active.length === 0 && dailyTaskSummary.planned.length === 0 ? (
            <EmptyState
              title="No tasks in motion"
              description="Capture one from the top bar or keep this as a clean slate."
            />
          ) : (
            [...dailyTaskSummary.active, ...dailyTaskSummary.planned].slice(0, 2).map(task => (
              <ListRow
                key={task.id}
                variant="card"
                label={task.title || 'Untitled task'}
                sub={`${task.status} · ${task.subtasks.filter(st => st.done === false).length} open subtasks`}
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Monthly tasks" title="Lightweight month rollup" />
        <div className="ui-metrics-row">
          <MetricBlock value={monthlyTaskSummary.total} label="This month" />
          <MetricBlock value={monthlyTaskSummary.active} label="Active" />
          <MetricBlock value={monthlyTaskSummary.done} label="Done" />
        </div>
        <div className="subtle-feed">
          {monthlyTaskSummary.preview.length === 0 ? (
            <EmptyState
              title="No month-level task data yet"
              description="New tasks will start filling this rollup automatically."
            />
          ) : (
            monthlyTaskSummary.preview.map(task => (
              <ListRow
                key={task.id}
                variant="card"
                label={task.title || 'Untitled task'}
                sub={`${task.status} · created ${formatShortMonthDay(task.createdAt)}`}
              />
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Notes rollup" title="Preview only" />
        <div className="ui-metrics-row">
          <MetricBlock value={notes.length} label="Notes" />
          <MetricBlock value={noteSummary.monthCount} label="This month" />
          <MetricBlock value={unreadCount} label="Unread" />
        </div>
        <div className="subtle-feed">
          {noteSummary.preview.length > 0 ? (
            noteSummary.preview.map(note => (
              <ListRow
                key={note.id}
                variant="card"
                label={note.content}
                sub={formatShortMonthDay(note.createdAt)}
              />
            ))
          ) : (
            <EmptyState
              title="No notes captured yet"
              description="Notes roll up here once they exist; nothing else is managed here."
            />
          )}
          {noteSummary.latest && (
            <p className="empty-message">
              Latest: {noteSummary.latest.content.slice(0, 60)}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="System summary" title="Quick state check" />
        <div className="ui-metrics-row">
          <MetricBlock value={`${systemSummary.energy}/5`} label="Energy" />
          <MetricBlock value={`${systemSummary.sleepHours}h`} label="Sleep" />
          <MetricBlock value={unreadCount} label="Inbox" />
        </div>
        <p className="empty-message">
          Source: {systemSummary.source} · last check-in {systemSummary.lastCheckIn}
        </p>
      </Card>
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
  const [activeTab, setActiveTab] = useState('dashboard');
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
      return <HomeScreen />;
    }

    if (activeTab === 'more') {
      return <MoreScreen now={now} />;
    }

    return (
      <DashboardScreen
        inboxCount={unreadNotifications.length}
        now={now}
        activeWorkoutId={activeWorkoutId}
        onStartWorkout={setActiveWorkoutId}
        onSwitchToCalendar={() => setActiveTab('calendar')}
        onSwitchToFitness={() => setActiveTab('fitness')}
        weeklyItems={weeklyItems}
      />
    );
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
