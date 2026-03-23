/**
 * HYROX 32-Week Plan
 *
 * Source: standalone HYROX plan. Contains the four training phases, alternating
 * A/B weekly templates (for both 4-day and 5-day schedules), all eight race
 * stations, and the pure helper functions that derive plan state from a week
 * number.
 */

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export const PHASES = [
  {
    id: 'base',
    name: 'Base',
    weekStart: 1,
    weekEnd: 8,
    description: 'Build aerobic base, introduce HYROX stations at controlled intensity.',
  },
  {
    id: 'build',
    name: 'Build',
    weekStart: 9,
    weekEnd: 16,
    description: 'Increase station volume and running intensity with progressive overload.',
  },
  {
    id: 'peak',
    name: 'Peak',
    weekStart: 17,
    weekEnd: 24,
    description: 'Race-specific brick sessions, full-circuit simulations, and peak load.',
  },
  {
    id: 'taper',
    name: 'Taper',
    weekStart: 25,
    weekEnd: 32,
    description: 'Manage fatigue, sharpen race pace, and prepare for race day.',
  },
];

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export const ALL_STATIONS = {
  skierg: {
    key: 'skierg',
    name: 'SkiErg',
    unit: 'm',
    raceDistance: 1000,
    category: 'cardio',
  },
  sledPush: {
    key: 'sledPush',
    name: 'Sled Push',
    unit: 'm',
    raceDistance: 50,
    category: 'strength',
  },
  sledPull: {
    key: 'sledPull',
    name: 'Sled Pull',
    unit: 'm',
    raceDistance: 50,
    category: 'strength',
  },
  burpeeBroadJump: {
    key: 'burpeeBroadJump',
    name: 'Burpee Broad Jump',
    unit: 'm',
    raceDistance: 80,
    category: 'power',
  },
  rowing: {
    key: 'rowing',
    name: 'Rowing',
    unit: 'm',
    raceDistance: 1000,
    category: 'cardio',
  },
  farmersCarry: {
    key: 'farmersCarry',
    name: 'Farmers Carry',
    unit: 'm',
    raceDistance: 200,
    category: 'strength',
  },
  sandbagLunges: {
    key: 'sandbagLunges',
    name: 'Sandbag Lunges',
    unit: 'm',
    raceDistance: 100,
    category: 'strength',
  },
  wallBalls: {
    key: 'wallBalls',
    name: 'Wall Balls',
    unit: 'reps',
    raceDistance: 100,
    category: 'power',
  },
};

// ---------------------------------------------------------------------------
// Weekly templates — Week A (odd weeks) = strength/station focus,
//                   Week B (even weeks) = aerobic/running focus
// ---------------------------------------------------------------------------

export const WEEKLY_TEMPLATES = {
  A: {
    '4-day': [
      {
        offset: 0,
        title: 'Strength + stations',
        detail: 'Heavy compound lifts and sled patterning',
        stations: ['sledPush', 'sledPull'],
      },
      {
        offset: 1,
        title: 'Run intervals',
        detail: '6× 1 km at 5 K effort with 90 s rest',
        stations: [],
      },
      {
        offset: 3,
        title: 'Hybrid brick',
        detail: 'Run/station combo targeting ski and row',
        stations: ['skierg', 'rowing'],
      },
      {
        offset: 5,
        title: 'Recovery reset',
        detail: 'Mobility, easy spin, and soft tissue work',
        stations: [],
      },
    ],
    '5-day': [
      {
        offset: 0,
        title: 'Strength + stations',
        detail: 'Heavy compound lifts and sled patterning',
        stations: ['sledPush', 'sledPull'],
      },
      {
        offset: 1,
        title: 'Run intervals',
        detail: '6× 1 km at 5 K effort with 90 s rest',
        stations: [],
      },
      {
        offset: 2,
        title: 'Engine builder',
        detail: '45–60 min aerobic conditioning',
        stations: [],
      },
      {
        offset: 4,
        title: 'Hybrid brick',
        detail: 'Run/station combo targeting ski and row',
        stations: ['skierg', 'rowing'],
      },
      {
        offset: 5,
        title: 'Recovery reset',
        detail: 'Mobility, easy spin, and soft tissue work',
        stations: [],
      },
    ],
  },
  B: {
    '4-day': [
      {
        offset: 0,
        title: 'Stations + aerobic',
        detail: 'Carry and power station circuit',
        stations: ['burpeeBroadJump', 'wallBalls'],
      },
      {
        offset: 1,
        title: 'Tempo run',
        detail: '20–30 min continuous at threshold pace',
        stations: [],
      },
      {
        offset: 3,
        title: 'Full circuit',
        detail: 'All 8 stations at race-simulation load',
        stations: ['skierg', 'sledPush', 'sledPull', 'burpeeBroadJump', 'rowing', 'farmersCarry', 'sandbagLunges', 'wallBalls'],
      },
      {
        offset: 5,
        title: 'Long easy run',
        detail: '45–60 min easy aerobic pace',
        stations: [],
      },
    ],
    '5-day': [
      {
        offset: 0,
        title: 'Stations + aerobic',
        detail: 'Carry and power station circuit',
        stations: ['burpeeBroadJump', 'wallBalls'],
      },
      {
        offset: 1,
        title: 'Tempo run',
        detail: '20–30 min continuous at threshold pace',
        stations: [],
      },
      {
        offset: 2,
        title: 'Farmers carry + lunges',
        detail: 'Loaded carry complex and lunge volume',
        stations: ['farmersCarry', 'sandbagLunges'],
      },
      {
        offset: 4,
        title: 'Full circuit',
        detail: 'All 8 stations at race-simulation load',
        stations: ['skierg', 'sledPush', 'sledPull', 'burpeeBroadJump', 'rowing', 'farmersCarry', 'sandbagLunges', 'wallBalls'],
      },
      {
        offset: 5,
        title: 'Long easy run',
        detail: '45–60 min easy aerobic pace',
        stations: [],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the phase object for a given 1-based week number.
 * Falls back to the last phase for any week beyond 32.
 */
export function getPhaseForWeek(weekNumber) {
  return (
    PHASES.find(p => weekNumber >= p.weekStart && weekNumber <= p.weekEnd) ??
    PHASES[PHASES.length - 1]
  );
}

/**
 * Returns the session array for a given frequency and week type.
 * weekType defaults to 'A' for odd weeks, 'B' for even weeks.
 * Each session's stations array contains full metadata objects { key, name, unit, category }.
 */
export function getWeeklyTemplate({ trainingDays, weekType, weekNumber }) {
  const type = weekType ?? (weekNumber % 2 === 1 ? 'A' : 'B');
  if (!WEEKLY_TEMPLATES[type]?.[trainingDays]) {
    console.warn('Invalid trainingDays or weekType', { trainingDays, type });
  }
  const sessions = WEEKLY_TEMPLATES[type]?.[trainingDays] ?? WEEKLY_TEMPLATES.A['4-day'];
  return sessions.map(session => ({
    ...session,
    stations: session.stations.map(key => ALL_STATIONS[key]).filter(Boolean),
  }));
}

/**
 * Returns the session array for a given week with concrete Date objects attached.
 * startDate is the program's Week 1 Day 0 anchor (e.g. new Date('2026-01-05')).
 * Each returned session includes all fields from getWeeklyTemplate plus `date`.
 */
export function buildWeeklySchedule({
  trainingDays,
  weekNumber,
  startDate,
}) {
  const template = getWeeklyTemplate({ trainingDays, weekNumber });
  const start = new Date(startDate);
  return template.map(session => {
    const date = new Date(start);
    date.setDate(date.getDate() + session.offset + (weekNumber - 1) * 7);
    return {
      ...session,
      date,
    };
  });
}

/**
 * Returns the current 1-based week number (1–32) relative to the program start date.
 */
export function getCurrentWeek({ startDate, today = new Date() }) {
  const start = new Date(startDate);
  const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.min(32, Math.floor(diff / 7) + 1));
}

/**
 * Returns the station metadata object for a given station key, or null.
 */
export function getStationMeta(stationKey) {
  return ALL_STATIONS[stationKey] ?? null;
}

/**
 * Builds the session list for a specific week, with concrete dates attached.
 * weekStart is derived from startDate + (weekNumber - 1) * 7 days.
 */
export function buildWeeklySchedule({ trainingDays, weekNumber, startDate }) {
  const sessions = getWeeklyTemplate({ trainingDays, weekNumber });
  const weekStart = new Date(startDate);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);

  return sessions.map(session => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + session.offset);
    return {
      ...session,
      date,
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  });
}

/**
 * Returns unified plan state for the current week: week number, phase, and
 * scheduled sessions with concrete dates.
 */
export function getPlanState({ startDate, trainingDays }) {
  const week = getCurrentWeek({ startDate });
  const phase = getPhaseForWeek(week);
  const sessions = buildWeeklySchedule({ trainingDays, weekNumber: week, startDate });
  return { week, phase, sessions };
}
