import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizeProfile } from '../data/workoutSystemState.js';

const ProfileContext = createContext(null);

const PROFILE_STORAGE_KEY = 'purple-waffle-profile';

function loadProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
