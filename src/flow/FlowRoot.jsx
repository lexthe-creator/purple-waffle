import React, { useMemo } from 'react';
import { useFlowEngine } from './useFlowEngine.js';
import { resolveMode, getNextEvent, normalizeCalendarEvents } from './resolveMode.js';
import { DayTypeSelector } from './DayTypeSelector.jsx';
import { JustStartView } from './JustStartView.jsx';
import { TopBar } from './TopBar.jsx';

/**
 * FlowRoot — full-screen flow engine overlay.
 *
 * Props:
 *   dayType        string | null     — persisted day type selection
 *   onDayType      (type) => void    — called when user selects a day type
 *   calendarCache  object            — { [dateKey]: Event[] } from profile
 *   todayKey       string            — "YYYY-MM-DD"
 *   now            Date              — current time (defaults to new Date())
 *   onClose        () => void        — exit flow mode
 */
export function FlowRoot({ dayType, onDayType, calendarCache = {}, todayKey, now = new Date(), onClose }) {
  const events = useMemo(
    () => normalizeCalendarEvents(calendarCache[todayKey] ?? [], todayKey),
    [calendarCache, todayKey],
  );

  const { mode, event: activeEvent } = useMemo(() => resolveMode(events, now), [events, now]);
  const nextEvent = useMemo(() => getNextEvent(events, now), [events, now]);

  const { currentTask, currentIndex, totalTasks, completeTask, skipTask, swapTask } = useFlowEngine(dayType);

  if (!dayType) {
    return <DayTypeSelector onSelect={onDayType} />;
  }

  return (
    <div style={S.root}>
      <TopBar nextEvent={nextEvent} onClose={onClose} />
      <JustStartView
        task={currentTask}
        currentIndex={currentIndex}
        totalTasks={totalTasks}
        mode={mode}
        event={activeEvent}
        onStart={completeTask}
        onSkip={skipTask}
        onSwap={swapTask}
      />
    </div>
  );
}

const S = {
  root: {
    position: 'fixed',
    inset: 0,
    background: '#F6F3EF',
    zIndex: 600,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
};
