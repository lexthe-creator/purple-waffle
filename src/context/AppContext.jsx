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
  const [morningChecklist, setMorningChecklist] = useState(() => loadChecklist());

  // Persist app state whenever it changes
  useEffect(() => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({ planningMode, energyState, fitnessSettings }),
    );
  }, [planningMode, energyState, fitnessSettings]);

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
      morningChecklist,
      setMorningChecklist,
    }),
    [planningMode, quickAddOpen, notificationCenterOpen, energyState, fitnessSettings, morningChecklist],
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
