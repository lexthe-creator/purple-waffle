import React, { createContext, useContext, useMemo, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [executionMode, setExecutionMode] = useState(true);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [energyState, setEnergyState] = useState({
    value: 3,
    sleepHours: 7,
    sleepSource: 'baseline',
    lastCheckIn: null,
  });

  const value = useMemo(
    () => ({
      executionMode,
      setExecutionMode,
      quickAddOpen,
      setQuickAddOpen,
      notificationCenterOpen,
      setNotificationCenterOpen,
      energyState,
      setEnergyState,
    }),
    [executionMode, quickAddOpen, notificationCenterOpen, energyState],
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
