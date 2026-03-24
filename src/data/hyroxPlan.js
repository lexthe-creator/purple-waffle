const STATION_META = {
  'SkiErg': { key: 'skierg', name: 'SkiErg', unit: 'm', raceDistance: 1000, category: 'cardio' },
  'Sled Push': { key: 'sledPush', name: 'Sled Push', unit: 'm', raceDistance: 50, category: 'strength' },
  'Sled Pull': { key: 'sledPull', name: 'Sled Pull', unit: 'm', raceDistance: 50, category: 'strength' },
  'Burpee Broad Jump': { key: 'burpeeBroadJump', name: 'Burpee Broad Jump', unit: 'm', raceDistance: 80, category: 'power' },
  'Row': { key: 'rowing', name: 'Row', unit: 'm', raceDistance: 1000, category: 'cardio' },
  'Farmers Carry': { key: 'farmersCarry', name: 'Farmers Carry', unit: 'm', raceDistance: 200, category: 'strength' },
  'Sandbag Lunges': { key: 'sandbagLunges', name: 'Sandbag Lunges', unit: 'm', raceDistance: 100, category: 'strength' },
  'Wall Ball': { key: 'wallBalls', name: 'Wall Ball', unit: 'reps', raceDistance: 100, category: 'power' },
};

export const PHASES = [
  {
    name: 'Base',
    id: 'base',
    weekStart: 1,
    weekEnd: 8,
    weekLabel: '1–8',
    theme: 'Build the engine',
  },
  {
    name: 'Build',
    id: 'build',
    weekStart: 9,
    weekEnd: 16,
    weekLabel: '9–16',
    theme: 'Add volume + stations',
  },
  {
    name: 'Specificity',
    id: 'specificity',
    weekStart: 17,
    weekEnd: 23,
    weekLabel: '17–23',
    theme: 'Train the race format',
  },
  {
    name: 'Peak',
    id: 'peak',
    weekStart: 24,
    weekEnd: 28,
    weekLabel: '24–28',
    theme: 'Max race-specific load',
  },
  {
    name: 'Taper',
    id: 'taper',
    weekStart: 29,
    weekEnd: 32,
    weekLabel: '29–32',
    theme: 'Arrive fresh and sharp',
  },
];

export const ALL_STATIONS = [
  'SkiErg',
  'Sled Push',
  'Sled Pull',
  'Burpee Broad Jump',
  'Row',
  'Farmers Carry',
  'Sandbag Lunges',
  'Wall Ball',
];

export const WEEKLY_TEMPLATES = {
  A: {
    '4-day': [
      { type: 'run_intervals', label: 'Run quality' },
      { type: 'strength_upper', label: 'Upper strength' },
      { type: 'run_aerobic', label: 'Run aerobic' },
      { type: 'strength_lower', label: 'Lower strength' },
    ],
    '5-day': [
      { type: 'run_intervals', label: 'Run intervals' },
      { type: 'strength_upper', label: 'Upper strength' },
      { type: 'run_aerobic', label: 'Run aerobic' },
      { type: 'strength_lower', label: 'Lower strength' },
      { type: 'run_threshold', label: 'Threshold run' },
    ],
  },
  B: {
    '4-day': [
      { type: 'run_threshold', label: 'Run threshold' },
      { type: 'hyrox_functional', label: 'Full HYROX' },
      { type: 'run_aerobic', label: 'Run aerobic' },
      { type: 'strength_circuit', label: 'Strength circuit' },
    ],
    '5-day': [
      { type: 'run_intervals', label: 'Run intervals' },
      { type: 'hyrox_functional', label: 'Full HYROX' },
      { type: 'run_aerobic', label: 'Run aerobic' },
      { type: 'strength_lower', label: 'Lower strength' },
      { type: 'hyrox_simulation', label: 'HYROX simulation' },
    ],
  },
};

function normalizeTrainingDays(trainingDays) {
  return trainingDays === '5-day' ? '5-day' : '4-day';
}

function normalizeWeekType(weekType, weekNumber) {
  if (weekType === 'A' || weekType === 'B') return weekType;
  return weekNumber % 2 === 1 ? 'A' : 'B';
}

function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function getPhaseForWeek(weekNumber) {
  const week = Number.isFinite(weekNumber) ? weekNumber : 1;
  return PHASES.find(phase => week >= phase.weekStart && week <= phase.weekEnd) ?? PHASES[PHASES.length - 1];
}

export function getWeeklyTemplate({ trainingDays, weekType, weekNumber }) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  return (WEEKLY_TEMPLATES[normalizedWeekType]?.[normalizedDays] ?? []).map(session => ({
    ...session,
    weekType: normalizedWeekType,
    trainingDays: normalizedDays,
  }));
}

export function getStationMeta(stationKey) {
  if (!stationKey) return null;
  if (STATION_META[stationKey]) return STATION_META[stationKey];
  return Object.values(STATION_META).find(station => station.key === stationKey || station.name === stationKey) ?? null;
}

function assertValidStartDate(startDate) {
  const parsed = new Date(startDate);
  if (!startDate || Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid or missing startDate');
  }
  return parsed;
}

export function getCurrentWeek({ startDate, today = new Date() }) {
  const start = assertValidStartDate(startDate);
  const current = new Date(today);
  const diff = Math.floor((current - start) / 86_400_000);
  return Math.max(1, Math.min(32, Math.floor(diff / 7) + 1));
}

export function buildWeeklySchedule({ trainingDays, weekNumber, startDate, weekType }) {
  const sessions = getWeeklyTemplate({ trainingDays, weekType, weekNumber });
  const weekStart = assertValidStartDate(startDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + ((weekNumber - 1) * 7));

  return sessions.map((session, index) => {
    const date = new Date(weekStart);
    const defaultOffsets = normalizeTrainingDays(trainingDays) === '5-day'
      ? [1, 2, 3, 4, 6]
      : [1, 3, 5, 6];
    const offset = Number.isFinite(session.offset) ? session.offset : defaultOffsets[index] ?? index;
    date.setDate(date.getDate() + offset);
    const stations = Array.isArray(session.stations)
      ? session.stations.map(getStationMeta).filter(Boolean)
      : [];
    return {
      ...session,
      offset,
      date,
      dateKey: toDateKey(date),
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      stations,
    };
  });
}

export function getPlanState({ startDate, trainingDays, today = new Date() }) {
  const week = getCurrentWeek({ startDate, today });
  const phase = getPhaseForWeek(week);
  const weekType = week % 2 === 1 ? 'A' : 'B';
  const sessions = buildWeeklySchedule({ startDate, trainingDays, weekNumber: week, weekType });

  return {
    week,
    phase,
    weekType,
    sessions,
    label: `Week ${week} · ${phase.name}`,
  };
}

