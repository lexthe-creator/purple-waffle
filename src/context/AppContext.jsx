import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AppContext = createContext(null);

const CHECKLIST_KEY = 'aiml-morning-checklist';

const DEFAULT_CHECKLIST = [
  { id: 'mc-1', label: 'Morning check-in', done: false },
  { id: 'mc-2', label: "Set today's priorities", done: false },
  { id: 'mc-3', label: 'Complete one action', done: false },
];

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

export function AppProvider({ children }) {
  const [planningMode, setPlanningMode] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [energyState, setEnergyState] = useState({
    value: 3,
    sleepHours: 7,
    sleepSource: 'baseline',
    lastCheckIn: null,
  });
  const [morningChecklist, setMorningChecklist] = useState(() => loadChecklist());

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
      morningChecklist,
      setMorningChecklist,
    }),
    [planningMode, quickAddOpen, notificationCenterOpen, energyState, morningChecklist],
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
