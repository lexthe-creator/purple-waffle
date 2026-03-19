import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const APP_STATE_STORAGE_KEY = 'purple-waffle-app-state-v1';
const WORKOUT_SESSION_STORAGE_KEY = 'purple-waffle-workout-session-v1';

const AppContext = createContext(null);

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

function normalizeEnergyState(raw = {}) {
  return {
    value: Number.isFinite(raw?.value) ? raw.value : 3,
    sleepHours: Number.isFinite(raw?.sleepHours) ? raw.sleepHours : 7,
    sleepSource: typeof raw?.sleepSource === 'string' ? raw.sleepSource : 'baseline',
    lastCheckIn: typeof raw?.lastCheckIn === 'string' ? raw.lastCheckIn : null,
  };
}

function normalizeWorkoutSession(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.activeWorkoutId !== 'string') {
    return null;
  }

  return {
    activeWorkoutId: raw.activeWorkoutId,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : new Date().toISOString(),
    elapsedSeconds: Number.isFinite(raw.elapsedSeconds) ? Math.max(0, Math.floor(raw.elapsedSeconds)) : 0,
    completedExerciseIds: Array.isArray(raw.completedExerciseIds)
      ? [...new Set(raw.completedExerciseIds.filter(id => typeof id === 'string'))]
      : [],
    lastUpdatedAt: typeof raw.lastUpdatedAt === 'string' ? raw.lastUpdatedAt : new Date().toISOString(),
  };
}

export function AppProvider({ children }) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [energyState, setEnergyState] = useState(() => normalizeEnergyState(loadJSON(APP_STATE_STORAGE_KEY)));
  const [workoutSession, setWorkoutSession] = useState(() => normalizeWorkoutSession(loadJSON(WORKOUT_SESSION_STORAGE_KEY)));

  useEffect(() => {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify({ energyState }));
  }, [energyState]);

  useEffect(() => {
    if (!workoutSession) {
      window.localStorage.removeItem(WORKOUT_SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(WORKOUT_SESSION_STORAGE_KEY, JSON.stringify(workoutSession));
  }, [workoutSession]);

  const startWorkoutSession = useCallback((workoutId) => {
    const now = new Date().toISOString();
    setWorkoutSession({
      activeWorkoutId: workoutId,
      startedAt: now,
      elapsedSeconds: 0,
      completedExerciseIds: [],
      lastUpdatedAt: now,
    });
  }, []);

  const toggleWorkoutExercise = useCallback((exerciseId) => {
    setWorkoutSession(current => {
      if (!current) return current;

      const completedExerciseIds = current.completedExerciseIds.includes(exerciseId)
        ? current.completedExerciseIds.filter(id => id !== exerciseId)
        : [...current.completedExerciseIds, exerciseId];

      return {
        ...current,
        completedExerciseIds,
        lastUpdatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const clearWorkoutSession = useCallback(() => {
    setWorkoutSession(null);
  }, []);

  const value = useMemo(
    () => ({
      quickAddOpen,
      setQuickAddOpen,
      notificationCenterOpen,
      setNotificationCenterOpen,
      energyState,
      setEnergyState,
      workoutSession,
      setWorkoutSession,
      startWorkoutSession,
      toggleWorkoutExercise,
      clearWorkoutSession,
    }),
    [
      clearWorkoutSession,
      energyState,
      notificationCenterOpen,
      quickAddOpen,
      startWorkoutSession,
      toggleWorkoutExercise,
      workoutSession,
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
