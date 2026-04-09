import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  buildWorkoutContentFromExercises,
  normalizeWorkoutExercise,
  normalizeWorkoutRecord,
} from '../data/workoutSystemState.js';

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

function createExercise(overrides = {}) {
  return {
    id: generateId('exercise'),
    name: '',
    detail: '',
    sets: null,
    reps: null,
    interval: null,
    timedEffort: null,
    duration: null,
    rest: null,
    distance: null,
    effort: null,
    note: null,
    cue: null,
    completed: false,
    ...overrides,
  };
}

function createWorkout(overrides = {}) {
  const seedExercises = [
    createExercise({ name: 'Warm-up', detail: '5 min mobility', timedEffort: '5 min', cue: 'Move through full range' }),
    createExercise({ name: 'Main set', detail: '3 rounds', sets: 3, note: 'Stay smooth between efforts' }),
    createExercise({ name: 'Cooldown', detail: 'Stretch + breathe', timedEffort: '5 min', cue: 'Bring breathing back down' }),
  ];

  const baseWorkout = {
    id: generateId('workout'),
    name: 'Focus Session',
    programId: 'hyrox',
    programName: 'HYROX 32-week plan',
    type: 'hyrox',
    status: 'planned',
    scheduledDate: null,
    plannedDate: null,
    date: null,
    sessionOffset: null,
    duration: 30,
    plannedDurationMinutes: 30,
    plannedTime: null,
    distanceMiles: 0,
    phase: 'Base',
    week: 1,
    programWeek: 1,
    frequency: '4-day',
    anchorDay: 'Monday',
    exercises: seedExercises,
    content: buildWorkoutContentFromExercises(seedExercises, {
      source: 'manual',
      notes: ['Built to support program imports later.'],
    }),
    source: {
      origin: 'manual',
      importKey: null,
      templateId: null,
      libraryId: null,
      sessionType: null,
    },
    workoutLog: null,
    startedAt: null,
    completedAt: null,
    createdAt: Date.now(),
  };

  const workout = {
    ...baseWorkout,
    ...overrides,
  };

  const resolvedExercises = Array.isArray(workout.exercises) ? workout.exercises : seedExercises;
  return normalizeWorkoutRecord({
    ...workout,
    exercises: resolvedExercises,
    date: workout.date || workout.plannedDate || workout.scheduledDate || null,
    plannedDurationMinutes: Number.isFinite(workout.plannedDurationMinutes)
      ? workout.plannedDurationMinutes
      : (Number.isFinite(workout.duration) ? workout.duration : 30),
    programWeek: Number.isFinite(workout.programWeek)
      ? workout.programWeek
      : (Number.isFinite(workout.week) ? workout.week : 1),
    week: Number.isFinite(workout.week)
      ? workout.week
      : (Number.isFinite(workout.programWeek) ? workout.programWeek : 1),
    content: workout.content || buildWorkoutContentFromExercises(resolvedExercises, {
      source: workout.programType || workout.programId ? 'program' : 'manual',
    }),
  });
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

function createInboxItem(overrides = {}) {
  return {
    id: generateId('inbox'),
    text: '',
    note: '',
    createdAt: Date.now(),
    stage: 'capture', // 'capture' | 'triaged'
    module: null, // null | 'task' | 'workout' | 'calendar' | 'meal' | 'note'
    scheduledDate: null,
    ...overrides,
  };
}

function createHabit(overrides = {}) {
  return {
    id: generateId('habit'),
    title: '',
    frequency: 'daily',
    completedDates: [],
    ...overrides,
  };
}

function createRoutineStep(overrides = {}) {
  return {
    id: generateId('step'),
    label: '',
    type: 'custom', // 'task' | 'habit' | 'focus' | 'custom'
    durationMinutes: null,
    ...overrides,
  };
}

function createRoutine(overrides = {}) {
  return {
    id: generateId('routine'),
    name: '',
    type: 'custom', // 'morning' | 'evening' | 'custom'
    steps: [],
    scheduleDays: [], // ['Monday', 'Tuesday', ...]
    scheduleTime: null, // 'HH:MM' or null
    lastCompleted: null,
    createdAt: Date.now(),
    ...overrides,
  };
}

function createCalendarItem(overrides = {}) {
  return {
    id: generateId('calendar'),
    type: 'event',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '10:00',
    notes: '',
    repeatWeekly: false,
    priority: false,
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

function normalizeExercise(exercise, index) {
  return normalizeWorkoutExercise({
    ...exercise,
    id: exercise?.id || generateId(`exercise-${index}`),
  }, index);
}

function normalizeWorkout(workout, index) {
  return normalizeWorkoutRecord({
    ...workout,
    exercises: Array.isArray(workout?.exercises)
      ? workout.exercises.map(normalizeExercise)
      : [],
  }, index);
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

function normalizeHabit(habit) {
  return {
    id: habit?.id || generateId('habit'),
    title: typeof habit?.title === 'string' ? habit.title : '',
    frequency: ['daily', 'weekly'].includes(habit?.frequency) ? habit.frequency : 'daily',
    completedDates: Array.isArray(habit?.completedDates)
      ? habit.completedDates.filter(d => typeof d === 'string')
      : [],
  };
}

function normalizeInboxItem(item, index) {
  // Legacy migration: 'fitness' → 'workout'
  const rawModule = item?.module === 'fitness' ? 'workout' : item?.module;
  return {
    id: item?.id || generateId('inbox'),
    text: typeof item?.text === 'string' ? item.text : '',
    note: typeof item?.note === 'string' ? item.note : '',
    createdAt: Number.isFinite(item?.createdAt) ? item.createdAt : Date.now() + index,
    stage: ['capture', 'triaged'].includes(item?.stage) ? item.stage : 'capture',
    module: ['task', 'workout', 'calendar', 'meal', 'note'].includes(rawModule) ? rawModule : null,
    scheduledDate: typeof item?.scheduledDate === 'string' ? item.scheduledDate : null,
  };
}

function normalizeCalendarItem(item) {
  return {
    id: item?.id || generateId('calendar'),
    type: ['busy', 'event', 'task'].includes(item?.type) ? item.type : 'event',
    title: typeof item?.title === 'string' ? item.title : '',
    date: typeof item?.date === 'string' ? item.date : new Date().toISOString().slice(0, 10),
    startTime: typeof item?.startTime === 'string' ? item.startTime : '09:00',
    endTime: typeof item?.endTime === 'string' ? item.endTime : '10:00',
    notes: typeof item?.notes === 'string' ? item.notes : '',
    repeatWeekly: item?.repeatWeekly === true,
    priority: item?.priority === true,
  };
}

function normalizeRoutineStep(step) {
  return {
    id: step?.id || generateId('step'),
    label: typeof step?.label === 'string' ? step.label : '',
    type: ['task', 'habit', 'focus', 'custom'].includes(step?.type) ? step.type : 'custom',
    durationMinutes: Number.isFinite(step?.durationMinutes) ? step.durationMinutes : null,
  };
}

function normalizeRoutine(routine) {
  return {
    id: routine?.id || generateId('routine'),
    name: typeof routine?.name === 'string' ? routine.name : '',
    type: ['morning', 'evening', 'custom'].includes(routine?.type) ? routine.type : 'custom',
    steps: Array.isArray(routine?.steps) ? routine.steps.map(normalizeRoutineStep) : [],
    scheduleDays: Array.isArray(routine?.scheduleDays) ? routine.scheduleDays.filter(d => typeof d === 'string') : [],
    scheduleTime: typeof routine?.scheduleTime === 'string' ? routine.scheduleTime : null,
    lastCompleted: typeof routine?.lastCompleted === 'string' ? routine.lastCompleted : null,
    createdAt: Number.isFinite(routine?.createdAt) ? routine.createdAt : Date.now(),
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

const DEFAULT_PANTRY_ITEMS = ['Eggs', 'Oats', 'Rice', 'Greek yogurt'];

function buildDefaultState() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const tomorrowKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

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
    habits: [],
    routines: [
      createRoutine({
        name: 'Morning Routine',
        type: 'morning',
        scheduleDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        scheduleTime: '07:00',
        steps: [
          createRoutineStep({ label: 'Hydrate — drink a glass of water', type: 'habit', durationMinutes: 1 }),
          createRoutineStep({ label: 'Morning check-in (energy + sleep)', type: 'custom', durationMinutes: 2 }),
          createRoutineStep({ label: 'Review today\'s top 3 tasks', type: 'task', durationMinutes: 3 }),
          createRoutineStep({ label: 'Set a focus intention', type: 'focus', durationMinutes: 2 }),
        ],
      }),
      createRoutine({
        name: 'Evening Wind-Down',
        type: 'evening',
        scheduleDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        scheduleTime: '21:00',
        steps: [
          createRoutineStep({ label: 'Clear inbox — triage anything captured today', type: 'task', durationMinutes: 5 }),
          createRoutineStep({ label: 'Set tomorrow\'s top priority', type: 'task', durationMinutes: 3 }),
          createRoutineStep({ label: 'Log a reflection note', type: 'custom', durationMinutes: 3 }),
        ],
      }),
    ],
    pantryItems: DEFAULT_PANTRY_ITEMS,
    inboxItems: [
      createInboxItem({ text: 'Look into new running shoes before race' }),
      createInboxItem({ text: 'Book physio appointment' }),
      createInboxItem({ text: 'Call mom back this week' }),
    ],
    calendarItems: [
      createCalendarItem({ id: 'calendar-seed-1', type: 'busy', title: 'Deep work block', date: todayKey, startTime: '09:00', endTime: '11:00', repeatWeekly: true, priority: true }),
      createCalendarItem({ id: 'calendar-seed-2', type: 'event', title: 'Lunch check-in', date: todayKey, startTime: '12:30', endTime: '13:00' }),
      createCalendarItem({ id: 'calendar-seed-3', type: 'task', title: 'Clear follow-ups', date: tomorrowKey, startTime: '16:00', endTime: '16:30', priority: true }),
    ],
  };
}

export function TaskProvider({ children }) {
  const initialState = loadInitialState();
  const defaults = buildDefaultState();
  const [tasks, setTasks] = useState(() => (initialState?.tasks || defaults.tasks).map(normalizeTask));
  const [meals, setMeals] = useState(() => (initialState?.meals || defaults.meals).map(normalizeMeal));
  const [notes, setNotes] = useState(() => (initialState?.notes || defaults.notes).map(normalizeNote));
  const [workouts, setWorkouts] = useState(() => (initialState?.workouts || defaults.workouts).map(normalizeWorkout));
  const [notifications, setNotifications] = useState(() => (initialState?.notifications || defaults.notifications).map(normalizeNotification));
  const [habits, setHabits] = useState(() => (initialState?.habits || defaults.habits).map(normalizeHabit));
  const [routines, setRoutines] = useState(() => (initialState?.routines || defaults.routines).map(normalizeRoutine));
  const [calendarItems, setCalendarItems] = useState(() => (initialState?.calendarItems || defaults.calendarItems).map(normalizeCalendarItem));
  const [inboxItems, setInboxItems] = useState(() => (initialState?.inboxItems || defaults.inboxItems).map(normalizeInboxItem));
  const [pantryItems, setPantryItems] = useState(() => {
    const saved = initialState?.pantryItems;
    return Array.isArray(saved) ? saved.filter(item => typeof item === 'string' && item.trim()) : defaults.pantryItems;
  });

  useEffect(() => {
    window.localStorage.setItem(
      TASKS_STORAGE_KEY,
      JSON.stringify({ tasks, meals, notes, workouts, notifications, habits, routines, calendarItems, inboxItems, pantryItems }),
    );
  }, [tasks, meals, notes, workouts, notifications, habits, routines, calendarItems, inboxItems, pantryItems]);

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
      createExercise,
      generateId,
      habits,
      setHabits,
      createHabit,
      routines,
      setRoutines,
      createRoutine,
      createRoutineStep,
      calendarItems,
      setCalendarItems,
      createCalendarItem,
      inboxItems,
      setInboxItems,
      createInboxItem,
      pantryItems,
      setPantryItems,
    }),
    [tasks, meals, notes, workouts, notifications, habits, routines, calendarItems, inboxItems, pantryItems],
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
