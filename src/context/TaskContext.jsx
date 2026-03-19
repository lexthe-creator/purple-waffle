import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const TASKS_STORAGE_KEY = 'purple-waffle-dashboard-v2';
const LEGACY_TASKS_STORAGE_KEY = 'purple-waffle-tasks-v1';
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const TaskContext = createContext(null);

function generateId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function createSubtask(title = '') {
  return {
    id: generateId('subtask'),
    title,
    done: false,
  };
}

function createTask(overrides = {}) {
  const createdAt = Date.now();

  return {
    id: generateId('task'),
    title: '',
    notes: '',
    status: 'planned',
    subtasks: [],
    createdAt,
    ...overrides,
  };
}

function createMeal(overrides = {}) {
  return {
    id: generateId('meal'),
    name: '',
    tags: [],
    loggedAt: Date.now(),
    ...overrides,
  };
}

function createNote(overrides = {}) {
  return {
    id: generateId('note'),
    content: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

function createWorkout(overrides = {}) {
  return {
    id: generateId('workout'),
    name: 'Focus Session',
    status: 'planned',
    duration: 30,
    exercises: [
      { id: generateId('exercise'), name: 'Warm-up', detail: '5 min mobility' },
      { id: generateId('exercise'), name: 'Main set', detail: '3 rounds' },
      { id: generateId('exercise'), name: 'Cooldown', detail: 'Stretch + breathe' },
    ],
    createdAt: Date.now(),
    ...overrides,
  };
}

function createNotification(overrides = {}) {
  return {
    id: generateId('notification'),
    title: 'New update',
    detail: '',
    createdAt: Date.now(),
    read: false,
    ...overrides,
  };
}

function createWeeklyItem(overrides = {}) {
  return {
    id: generateId('weekly'),
    title: '',
    status: 'planned',
    date: toDateKey(Date.now()),
    ...overrides,
  };
}

function normalizeTask(task, index) {
  return {
    id: task?.id || generateId('task'),
    title: typeof task?.title === 'string' ? task.title : '',
    notes: typeof task?.notes === 'string' ? task.notes : '',
    status: ['planned', 'active', 'done'].includes(task?.status) ? task.status : 'planned',
    subtasks: Array.isArray(task?.subtasks)
      ? task.subtasks.map(subtask => ({
          id: subtask?.id || generateId('subtask'),
          title: typeof subtask?.title === 'string' ? subtask.title : '',
          done: subtask?.done === true,
        }))
      : [],
    createdAt: Number.isFinite(task?.createdAt) ? task.createdAt : Date.now() + index,
  };
}

function normalizeMeal(meal, index) {
  return {
    id: meal?.id || generateId('meal'),
    name: typeof meal?.name === 'string' ? meal.name : '',
    tags: Array.isArray(meal?.tags) ? meal.tags.filter(tag => typeof tag === 'string') : [],
    loggedAt: Number.isFinite(meal?.loggedAt) ? meal.loggedAt : Date.now() + index,
  };
}

function normalizeNote(note, index) {
  return {
    id: note?.id || generateId('note'),
    content: typeof note?.content === 'string' ? note.content : '',
    createdAt: Number.isFinite(note?.createdAt) ? note.createdAt : Date.now() + index,
  };
}

function normalizeWorkout(workout, index) {
  return {
    id: workout?.id || generateId('workout'),
    name: typeof workout?.name === 'string' ? workout.name : 'Focus Session',
    status: ['planned', 'active', 'completed'].includes(workout?.status) ? workout.status : 'planned',
    duration: Number.isFinite(workout?.duration) ? workout.duration : 30,
    exercises: Array.isArray(workout?.exercises)
      ? workout.exercises.map((exercise, exerciseIndex) => ({
          id: exercise?.id || generateId(`exercise-${exerciseIndex}`),
          name: typeof exercise?.name === 'string' ? exercise.name : `Exercise ${exerciseIndex + 1}`,
          detail: typeof exercise?.detail === 'string' ? exercise.detail : '',
        }))
      : [],
    createdAt: Number.isFinite(workout?.createdAt) ? workout.createdAt : Date.now() + index,
  };
}

function normalizeNotification(notification, index) {
  return {
    id: notification?.id || generateId('notification'),
    title: typeof notification?.title === 'string' ? notification.title : 'Update',
    detail: typeof notification?.detail === 'string' ? notification.detail : '',
    createdAt: Number.isFinite(notification?.createdAt) ? notification.createdAt : Date.now() + index,
    read: notification?.read === true,
  };
}

function normalizeWeeklyItem(item, index) {
  return {
    id: item?.id || generateId('weekly'),
    title: typeof item?.title === 'string' ? item.title : '',
    status: ['planned', 'completed', 'missed'].includes(item?.status) ? item.status : 'planned',
    date: typeof item?.date === 'string' && DATE_KEY_RE.test(item.date) ? item.date : toDateKey(Date.now() + (index * 86400000)),
  };
}

function loadJSON(key) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mapLegacyStatus(status) {
  if (status === 'active' || status === 'done') {
    return status;
  }

  return 'planned';
}

function migrateLegacyTasks(rawTasks) {
  if (!Array.isArray(rawTasks)) {
    return null;
  }

  const tasks = [...rawTasks]
    .sort((left, right) => {
      const leftOrder = Number.isFinite(left?.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right?.order) ? right.order : Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const leftCreatedAt = Number.isFinite(left?.createdAt) ? left.createdAt : 0;
      const rightCreatedAt = Number.isFinite(right?.createdAt) ? right.createdAt : 0;
      return leftCreatedAt - rightCreatedAt;
    })
    .map((task, index) => normalizeTask({
      id: task?.id,
      title: task?.title,
      notes: task?.notes,
      status: mapLegacyStatus(task?.status),
      subtasks: Array.isArray(task?.subtasks) ? task.subtasks : [],
      createdAt: Number.isFinite(task?.createdAt) ? task.createdAt : Date.now() + index,
    }, index));

  return {
    tasks,
    meals: [],
    notes: [],
    workouts: [],
    notifications: [],
    weeklyItems: [],
  };
}

function loadInitialState() {
  const storedState = loadJSON(TASKS_STORAGE_KEY);
  if (storedState) {
    return storedState;
  }

  const legacyTasks = loadJSON(LEGACY_TASKS_STORAGE_KEY);
  return migrateLegacyTasks(legacyTasks);
}

function buildDefaultWeeklyItems() {
  const now = new Date();

  return [
    createWeeklyItem({ title: 'Deep work block', status: 'planned', date: toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)) }),
    createWeeklyItem({ title: 'Strength session', status: 'completed', date: toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)) }),
    createWeeklyItem({ title: 'Meal prep', status: 'missed', date: toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3)) }),
  ];
}

function buildDefaultState() {
  return {
    tasks: [
      createTask({ title: 'Ship quick wins', status: 'active', notes: 'Stay in one flow.', subtasks: [createSubtask('Tighten header'), createSubtask('Clean execution mode')] }),
      createTask({ title: 'Clear follow-ups', status: 'planned', subtasks: [createSubtask('Reply to inbox'), createSubtask('Schedule tomorrow')] }),
    ],
    meals: [createMeal({ name: 'Greek yogurt bowl', tags: ['protein', 'quick'] })],
    notes: [createNote({ content: 'Keep the interface quiet and fast.' })],
    workouts: [createWorkout({ name: 'Lunch strength', duration: 35 })],
    notifications: [
      createNotification({ title: 'Energy auto-filled', detail: 'Using your baseline until you check in.' }),
      createNotification({ title: 'Weekly review', detail: 'Two items need rescheduling this week.' }),
    ],
    weeklyItems: buildDefaultWeeklyItems(),
  };
}

export function TaskProvider({ children }) {
  const initialState = loadInitialState();
  const fallbackState = initialState
    ? { tasks: [], meals: [], notes: [], workouts: [], notifications: [], weeklyItems: [] }
    : buildDefaultState();
  const [tasks, setTasks] = useState(() => (Array.isArray(initialState?.tasks) ? initialState.tasks : fallbackState.tasks).map(normalizeTask));
  const [meals, setMeals] = useState(() => (Array.isArray(initialState?.meals) ? initialState.meals : fallbackState.meals).map(normalizeMeal));
  const [notes, setNotes] = useState(() => (Array.isArray(initialState?.notes) ? initialState.notes : fallbackState.notes).map(normalizeNote));
  const [workouts, setWorkouts] = useState(() => (Array.isArray(initialState?.workouts) ? initialState.workouts : fallbackState.workouts).map(normalizeWorkout));
  const [notifications, setNotifications] = useState(() => (Array.isArray(initialState?.notifications) ? initialState.notifications : fallbackState.notifications).map(normalizeNotification));
  const [weeklyItems, setWeeklyItems] = useState(() => (Array.isArray(initialState?.weeklyItems) ? initialState.weeklyItems : fallbackState.weeklyItems).map(normalizeWeeklyItem));

  useEffect(() => {
    window.localStorage.setItem(
      TASKS_STORAGE_KEY,
      JSON.stringify({ tasks, meals, notes, workouts, notifications, weeklyItems }),
    );
  }, [tasks, meals, notes, workouts, notifications, weeklyItems]);

  const value = useMemo(
    () => ({
      tasks,
      setTasks,
      meals,
      setMeals,
      notes,
      setNotes,
      workouts,
      setWorkouts,
      notifications,
      setNotifications,
      weeklyItems,
      setWeeklyItems,
      createTask,
      createMeal,
      createNote,
      createWorkout,
      createNotification,
      createSubtask,
      generateId,
    }),
    [tasks, meals, notes, workouts, notifications, weeklyItems],
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskContext() {
  const value = useContext(TaskContext);

  if (!value) {
    throw new Error('useTaskContext must be used inside TaskProvider');
  }

  return value;
}
