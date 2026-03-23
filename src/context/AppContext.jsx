import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AppContext = createContext(null);

const CHECKLIST_KEY = 'aiml-morning-checklist';
const APP_STATE_KEY = 'purple-waffle-app-state';

const DEFAULT_CHECKLIST = [
  { id: 'mc-1', label: 'Morning check-in', done: false },
  { id: 'mc-2', label: "Set today's priorities", done: false },
  { id: 'mc-3', label: 'Complete one action', done: false },
];

const DEFAULT_ENERGY = {
  value: 3,
  sleepHours: 7,
  sleepSource: 'baseline',
  lastCheckIn: null,
};

const DEFAULT_FITNESS_SETTINGS = {
  programType: 'hyrox',
  selectedFrequency: '4-day',
  programAnchor: 'Monday',
  programStartDate: new Date().toISOString().slice(0, 10),
};

const DEFAULT_RACE_SETTINGS = {
  raceDate: null,
  raceName: '',
  raceCategory: 'Open',
  targetFinishTime: '',
};

const DEFAULT_WORK_CALENDAR_PREFS = {
  planningOrder: 'priority',
  busyBlockBehavior: 'hard',
};

const DEFAULT_MEAL_PREFS = {
  hydrationGoal: 8,
  dietaryNotes: '',
};

const DEFAULT_NOTIFICATION_PREFS = {
  morningReminder: true,
  workoutReminder: true,
};

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadChecklist() {
  try {
    const raw = window.localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return DEFAULT_CHECKLIST;
    const saved = JSON.parse(raw);
    if (saved.date !== getTodayDateKey()) return DEFAULT_CHECKLIST;
    return Array.isArray(saved.items) ? saved.items : DEFAULT_CHECKLIST;
  } catch {
    return DEFAULT_CHECKLIST;
  }
}

function loadAppState() {
  try {
    const raw = window.localStorage.getItem(APP_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  const saved = loadAppState();

  const [planningMode, setPlanningMode] = useState(() => saved?.planningMode ?? true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [energyState, setEnergyState] = useState(() => ({
    ...DEFAULT_ENERGY,
    ...(saved?.energyState || {}),
  }));
  const [fitnessSettings, setFitnessSettings] = useState(() => ({
    ...DEFAULT_FITNESS_SETTINGS,
    ...(saved?.fitnessSettings || {}),
  }));
  const [raceSettings, setRaceSettings] = useState(() => ({
    ...DEFAULT_RACE_SETTINGS,
    ...(saved?.raceSettings || {}),
  }));
  const [workCalendarPrefs, setWorkCalendarPrefs] = useState(() => ({
    ...DEFAULT_WORK_CALENDAR_PREFS,
    ...(saved?.workCalendarPrefs || {}),
  }));
  const [mealPrefs, setMealPrefs] = useState(() => ({
    ...DEFAULT_MEAL_PREFS,
    ...(saved?.mealPrefs || {}),
  }));
  const [notificationPrefs, setNotificationPrefs] = useState(() => ({
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(saved?.notificationPrefs || {}),
  }));
  const [morningChecklist, setMorningChecklist] = useState(() => loadChecklist());

  // Morning check-in modal state
  const [showMorningCheckin, setShowMorningCheckin] = useState(false);
  const [morningStep, setMorningStep] = useState(0);
  const [energyScore, setEnergyScore] = useState(3);
  const [sleepHours, setSleepHours] = useState(7);

  // Persist app state whenever it changes
  useEffect(() => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ planningMode, energyState, fitnessSettings, raceSettings, workCalendarPrefs, mealPrefs, notificationPrefs }),
    );
  }, [planningMode, energyState, fitnessSettings, raceSettings, workCalendarPrefs, mealPrefs, notificationPrefs]);

  // Persist daily checklist
  useEffect(() => {
    window.localStorage.setItem(
      CHECKLIST_KEY,
      JSON.stringify({ date: getTodayDateKey(), items: morningChecklist }),
    );
  }, [morningChecklist]);

  const value = useMemo(
    () => ({
      planningMode,
      setPlanningMode,
      quickAddOpen,
      setQuickAddOpen,
      notificationCenterOpen,
      setNotificationCenterOpen,
      energyState,
      setEnergyState,
      fitnessSettings,
      setFitnessSettings,
      raceSettings,
      setRaceSettings,
      workCalendarPrefs,
      setWorkCalendarPrefs,
      mealPrefs,
      setMealPrefs,
      notificationPrefs,
      setNotificationPrefs,
      morningChecklist,
      setMorningChecklist,
      // Morning check-in modal
      showMorningCheckin,
      setShowMorningCheckin,
      morningStep,
      setMorningStep,
      energyScore,
      setEnergyScore,
      sleepHours,
      setSleepHours,
    }),
    [
      planningMode, quickAddOpen, notificationCenterOpen,
      energyState, fitnessSettings, raceSettings, workCalendarPrefs, mealPrefs, notificationPrefs,
      morningChecklist, showMorningCheckin, morningStep, energyScore, sleepHours,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const value = useContext(AppContext);

  if (!value) {
    throw new Error('useAppContext must be used inside AppProvider');
  }

  return value;
}
