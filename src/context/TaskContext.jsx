import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeWorkoutRecord } from '../data/workoutSystemState.js';

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
    duration: null,
    completed: false,
    ...overrides,
  };
}

function createWorkout(overrides = {}) {
  return {
    id: generateId('workout'),
    name: 'Focus Session',
    programId: 'hyrox',
    programName: 'HYROX 32-week plan',
    type: 'hyrox',
    status: 'planned',
    scheduledDate: null,
    plannedDate: null,
    sessionOffset: null,
    duration: 30,
    distanceMiles: 0,
    phase: 'Base',
    week: 1,
    frequency: '4-day',
    anchorDay: 'Monday',
    exercises: [
      createExercise({ name: 'Warm-up', detail: '5 min mobility' }),
      createExercise({ name: 'Main set', detail: '3 rounds' }),
      createExercise({ name: 'Cooldown', detail: 'Stretch + breathe' }),
    ],
    workoutLog: null,
    startedAt: null,
    completedAt: null,
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

function createInboxItem(overrides = {}) {
  return {
    id: generateId('inbox'),
    text: '',
    createdAt: Date.now(),
    module: null, // null | 'task' | 'fitness' | 'calendar' | 'note'
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
  return {
    id: exercise?.id || generateId(`exercise-${index}`),
    name: typeof exercise?.name === 'string' ? exercise.name : `Exercise ${index + 1}`,
    detail: typeof exercise?.detail === 'string' ? exercise.detail : '',
    sets: Number.isFinite(exercise?.sets) ? exercise.sets : null,
    reps: typeof exercise?.reps === 'string' ? exercise.reps : null,
    duration: typeof exercise?.duration === 'string' ? exercise.duration : null,
    completed: exercise?.completed === true,
  };
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
  return {
    id: item?.id || generateId('inbox'),
    text: typeof item?.text === 'string' ? item.text : '',
    createdAt: Number.isFinite(item?.createdAt) ? item.createdAt : Date.now() + index,
    module: ['task', 'fitness', 'calendar', 'note'].includes(item?.module) ? item.module : null,
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
  const [calendarItems, setCalendarItems] = useState(() => (initialState?.calendarItems || defaults.calendarItems).map(normalizeCalendarItem));
  const [inboxItems, setInboxItems] = useState(() => (initialState?.inboxItems || defaults.inboxItems).map(normalizeInboxItem));
  const [pantryItems, setPantryItems] = useState(() => {
    const saved = initialState?.pantryItems;
    return Array.isArray(saved) ? saved.filter(item => typeof item === 'string' && item.trim()) : defaults.pantryItems;
  });

  useEffect(() => {
    window.localStorage.setItem(
      TASKS_STORAGE_KEY,
      JSON.stringify({ tasks, meals, notes, workouts, notifications, habits, calendarItems, inboxItems, pantryItems }),
    );
  }, [tasks, meals, notes, workouts, notifications, habits, calendarItems, inboxItems, pantryItems]);

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
      calendarItems,
      setCalendarItems,
      inboxItems,
      setInboxItems,
      createInboxItem,
      pantryItems,
      setPantryItems,
    }),
    [tasks, meals, notes, workouts, notifications, habits, calendarItems, inboxItems, pantryItems],
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
