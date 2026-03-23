import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ProfileContext = createContext(null);

const PROFILE_STORAGE_KEY = 'purple-waffle-profile';

const DEFAULT_PROFILE = {
  athlete: {
    fiveKTime: null,
    hyroxFinishTime: null,
    weakStations: [],
    strongStations: [],
    squat5RM: null,
    deadlift5RM: null,
    programType: '4-day',
    preferredTrainingDays: ['Mon', 'Wed', 'Fri', 'Sat'],
    fitnessLevel: 'intermediate',
    equipment: [],
  },
  dailyLogs: {},        // keyed YYYY-MM-DD
  top3: {},             // keyed YYYY-MM-DD
  workoutHistory: [],
  transactions: [],
  recurringExpenses: [],
  habits: [],
  groceryList: [],
  maintenanceHistory: {},
};

function loadProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function normalizeAthlete(raw) {
  const def = DEFAULT_PROFILE.athlete;
  const src = isPlainObject(raw) ? raw : {};
  return {
    fiveKTime: typeof src.fiveKTime === 'string' ? src.fiveKTime : def.fiveKTime,
    hyroxFinishTime: typeof src.hyroxFinishTime === 'string' ? src.hyroxFinishTime : def.hyroxFinishTime,
    weakStations: Array.isArray(src.weakStations) ? src.weakStations.filter(s => typeof s === 'string') : def.weakStations,
    strongStations: Array.isArray(src.strongStations) ? src.strongStations.filter(s => typeof s === 'string') : def.strongStations,
    squat5RM: Number.isFinite(src.squat5RM) ? src.squat5RM : def.squat5RM,
    deadlift5RM: Number.isFinite(src.deadlift5RM) ? src.deadlift5RM : def.deadlift5RM,
    programType: typeof src.programType === 'string' ? src.programType : def.programType,
    preferredTrainingDays: Array.isArray(src.preferredTrainingDays)
      ? src.preferredTrainingDays.filter(d => typeof d === 'string')
      : def.preferredTrainingDays,
    fitnessLevel: typeof src.fitnessLevel === 'string' ? src.fitnessLevel : def.fitnessLevel,
    equipment: Array.isArray(src.equipment) ? src.equipment.filter(e => typeof e === 'string') : def.equipment,
  };
}

function normalizeProfile(raw) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    athlete: normalizeAthlete(src.athlete),
    dailyLogs: isPlainObject(src.dailyLogs) ? src.dailyLogs : {},
    top3: isPlainObject(src.top3) ? src.top3 : {},
    workoutHistory: Array.isArray(src.workoutHistory) ? src.workoutHistory : [],
    transactions: Array.isArray(src.transactions) ? src.transactions : [],
    recurringExpenses: Array.isArray(src.recurringExpenses) ? src.recurringExpenses : [],
    habits: Array.isArray(src.habits) ? src.habits : [],
    groceryList: Array.isArray(src.groceryList) ? src.groceryList : [],
    maintenanceHistory: isPlainObject(src.maintenanceHistory) ? src.maintenanceHistory : {},
  };
}

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(() => normalizeProfile(loadProfile()));

  useEffect(() => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  const updateAthlete = useCallback((patch) => {
    setProfile(p => ({ ...p, athlete: { ...p.athlete, ...patch } }));
  }, []);

  const value = useMemo(
    () => ({ profile, setProfile, updateAthlete }),
    [profile, updateAthlete],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfileContext() {
  const value = useContext(ProfileContext);

  if (!value) {
    throw new Error('useProfileContext must be used inside ProfileProvider');
  }

  return value;
}
