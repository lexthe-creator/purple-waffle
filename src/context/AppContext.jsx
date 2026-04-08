import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeAppState } from '../data/workoutSystemState.js';

const AppContext = createContext(null);

const CHECKLIST_KEY = 'aiml-morning-checklist';
const APP_STATE_KEY = 'purple-waffle-app-state';

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
  const saved = normalizeAppState(loadAppState());

  const [planningMode, setPlanningMode] = useState(() => saved.planningMode);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [energyState, setEnergyState] = useState(() => saved.energyState);
  const [fitnessSettings, setFitnessSettings] = useState(() => saved.fitnessSettings);
  const [workCalendarPrefs, setWorkCalendarPrefs] = useState(() => saved.workCalendarPrefs);
  const [mealPrefs, setMealPrefs] = useState(() => saved.mealPrefs);
  const [notificationPrefs, setNotificationPrefs] = useState(() => saved.notificationPrefs);
  const [calendarPatterns, setCalendarPatterns] = useState(() => saved.calendarPatterns);
  const [recoveryInputs, setRecoveryInputs] = useState(() => saved.recoveryInputs);
  const [hubInsights, setHubInsights] = useState(() => saved.hubInsights);
  const [morningChecklist, setMorningChecklist] = useState(() => loadChecklist());
  const [selectedDate, setSelectedDate] = useState(getTodayDateKey);

  // ---------------------------------------------------------------------------
  // Active execution block — single source of truth for what is currently running
  // Shape: null | { type: 'focus' | 'workout' | 'routine', id: string | null }
  // ---------------------------------------------------------------------------
  const [activeBlock, _setActiveBlock] = useState(null);

  const setActiveBlock = useCallback((next) => {
    if (
      next !== null &&
      (typeof next !== 'object' || !['focus', 'workout', 'routine'].includes(next.type))
    ) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[AppContext] setActiveBlock: invalid shape', next);
      }
      return;
    }
    _setActiveBlock(next);
  }, []);

  // ---------------------------------------------------------------------------
  // Focus session — non-active fields stored separately; `active` is derived
  // ---------------------------------------------------------------------------
  const [focusSessionDetails, setFocusSessionDetails] = useState({
    taskLabel: '',
    durationMinutes: 25,
    startedAt: null,
  });

  // focusSession.active is derived from activeBlock — no separate boolean to keep in sync.
  // setFocusSessionDetails updates only non-active fields (taskLabel, durationMinutes, startedAt).
  // Callers that need to start/stop focus must call setActiveBlock directly.
  const focusSession = useMemo(() => ({
    active: activeBlock?.type === 'focus',
    ...focusSessionDetails,
  }), [activeBlock, focusSessionDetails]);

  // Morning check-in modal state
  const [showMorningCheckin, setShowMorningCheckin] = useState(false);
  const [morningStep, setMorningStep] = useState(1);
  const [energyScore, setEnergyScore] = useState(3);
  const [sleepHours, setSleepHours] = useState(7);

  // Persist app state whenever it changes
  useEffect(() => {
    window.localStorage.setItem(
      APP_STATE_KEY,
      JSON.stringify({
        planningMode,
        energyState,
        fitnessSettings,
        workCalendarPrefs,
        mealPrefs,
        notificationPrefs,
        calendarPatterns,
        recoveryInputs,
        hubInsights,
      }),
    );
  }, [planningMode, energyState, fitnessSettings, workCalendarPrefs, mealPrefs, notificationPrefs, calendarPatterns, recoveryInputs, hubInsights]);

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
      workCalendarPrefs,
      setWorkCalendarPrefs,
      mealPrefs,
      setMealPrefs,
      notificationPrefs,
      setNotificationPrefs,
      calendarPatterns,
      setCalendarPatterns,
      recoveryInputs,
      setRecoveryInputs,
      hubInsights,
      setHubInsights,
      morningChecklist,
      setMorningChecklist,
      selectedDate,
      setSelectedDate,
      // Active execution block (single source of truth)
      activeBlock,
      setActiveBlock,
      // Focus session (active field is derived from activeBlock)
      // Use setActiveBlock for start/stop; setFocusSessionDetails for detail-only updates.
      focusSession,
      setFocusSessionDetails,
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
      energyState, fitnessSettings, workCalendarPrefs, mealPrefs, notificationPrefs,
      calendarPatterns, recoveryInputs, hubInsights,
      morningChecklist, showMorningCheckin, morningStep, energyScore, sleepHours,
      selectedDate, focusSession, activeBlock, setActiveBlock,
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
