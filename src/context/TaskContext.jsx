import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const TASKS_STORAGE_KEY = 'purple-waffle-dashboard-v2';

const TaskContext = createContext(null);

function generateId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    priority: false,
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
    programId: 'strength',
    programName: 'Strength Base',
    type: 'strength',
    status: 'planned',
    duration: 30,
    distanceMiles: 0,
    phase: 'Base',
    week: 1,
    frequency: '4-day',
    anchorDay: 'Monday',
    exercises: [
      { id: generateId('exercise'), name: 'Warm-up', detail: '5 min mobility' },
      { id: generateId('exercise'), name: 'Main set', detail: '3 rounds' },
      { id: generateId('exercise'), name: 'Cooldown', detail: 'Stretch + breathe' },
    ],
    createdAt: Date.now(),
    ...overrides,
  };
}

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

function normalizeTask(task, index) {
  return {
    id: task?.id || generateId('task'),
    title: typeof task?.title === 'string' ? task.title : '',
    notes: typeof task?.notes === 'string' ? task.notes : '',
    status: ['planned', 'active', 'done'].includes(task?.status) ? task.status : 'planned',
    priority: task?.priority === true,
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
  const programId = inferWorkoutProgram(workout);
  const defaultProgramName = {
    hyrox: 'HYROX',
    strength: 'Strength Base',
    running: 'Running Build',
    pilates: 'Pilates Flow',
    recovery: 'Recovery Reset',
  }[programId];

  return {
    id: workout?.id || generateId('workout'),
    name: typeof workout?.name === 'string' ? workout.name : 'Focus Session',
    programId,
    programName: typeof workout?.programName === 'string' && workout.programName ? workout.programName : defaultProgramName,
    type: programId,
    status: ['planned', 'active', 'completed'].includes(workout?.status) ? workout.status : 'planned',
    duration: Number.isFinite(workout?.duration) ? workout.duration : 30,
    distanceMiles: Number.isFinite(workout?.distanceMiles) ? workout.distanceMiles : 0,
    phase: typeof workout?.phase === 'string' && workout.phase ? workout.phase : 'Base',
    week: Number.isFinite(workout?.week) ? workout.week : 1,
    frequency: workout?.frequency === '5-day' ? '5-day' : '4-day',
    anchorDay: ['Sunday', 'Monday', 'Wednesday'].includes(workout?.anchorDay) ? workout.anchorDay : 'Monday',
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

function loadInitialState() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildDefaultState() {
  return {
    tasks: [
      createTask({ title: 'Ship quick wins', status: 'active', priority: true, notes: 'Stay in one flow.', subtasks: [createSubtask('Tighten header'), createSubtask('Clean execution mode')] }),
      createTask({ title: 'Clear follow-ups', status: 'planned', subtasks: [createSubtask('Reply to inbox'), createSubtask('Schedule tomorrow')] }),
    ],
    meals: [createMeal({ name: 'Greek yogurt bowl', tags: ['protein', 'quick'] })],
    notes: [createNote({ content: 'Keep the interface quiet and fast.' })],
    workouts: [createWorkout({ name: 'Lunch strength', duration: 35 })],
    notifications: [
      createNotification({ title: 'Energy auto-filled', detail: 'Using your baseline until you check in.' }),
      createNotification({ title: 'Weekly review', detail: 'Two items need rescheduling this week.' }),
    ],
  };
}

export function TaskProvider({ children }) {
  const initialState = loadInitialState();
  const [tasks, setTasks] = useState(() => (initialState?.tasks || buildDefaultState().tasks).map(normalizeTask));
  const [meals, setMeals] = useState(() => (initialState?.meals || buildDefaultState().meals).map(normalizeMeal));
  const [notes, setNotes] = useState(() => (initialState?.notes || buildDefaultState().notes).map(normalizeNote));
  const [workouts, setWorkouts] = useState(() => (initialState?.workouts || buildDefaultState().workouts).map(normalizeWorkout));
  const [notifications, setNotifications] = useState(() => (initialState?.notifications || buildDefaultState().notifications).map(normalizeNotification));

  useEffect(() => {
    window.localStorage.setItem(
      TASKS_STORAGE_KEY,
      JSON.stringify({ tasks, meals, notes, workouts, notifications }),
    );
  }, [tasks, meals, notes, workouts, notifications]);

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
      createTask,
      createMeal,
      createNote,
      createWorkout,
      createNotification,
      createSubtask,
      generateId,
    }),
    [tasks, meals, notes, workouts, notifications],
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
