const STATION_META = {
  SkiErg: { key: 'skierg', name: 'SkiErg', unit: 'm', raceDistance: 1000, category: 'cardio' },
  'Sled Push': { key: 'sledPush', name: 'Sled Push', unit: 'm', raceDistance: 50, category: 'strength' },
  'Sled Pull': { key: 'sledPull', name: 'Sled Pull', unit: 'm', raceDistance: 50, category: 'strength' },
  'Burpee Broad Jump': { key: 'burpeeBroadJump', name: 'Burpee Broad Jump', unit: 'm', raceDistance: 80, category: 'power' },
  Row: { key: 'rowing', name: 'Row', unit: 'm', raceDistance: 1000, category: 'cardio' },
  'Farmers Carry': { key: 'farmersCarry', name: 'Farmers Carry', unit: 'm', raceDistance: 200, category: 'strength' },
  'Sandbag Lunges': { key: 'sandbagLunges', name: 'Sandbag Lunges', unit: 'm', raceDistance: 100, category: 'strength' },
  'Wall Ball': { key: 'wallBalls', name: 'Wall Ball', unit: 'reps', raceDistance: 100, category: 'power' },
};

export const PHASES = [
  { name: 'Base', id: 'base', weekStart: 1, weekEnd: 8, weekLabel: '1–8', theme: 'Build the engine' },
  { name: 'Build', id: 'build', weekStart: 9, weekEnd: 16, weekLabel: '9–16', theme: 'Add volume + stations' },
  { name: 'Specificity', id: 'specificity', weekStart: 17, weekEnd: 23, weekLabel: '17–23', theme: 'Train the race format' },
  { name: 'Peak', id: 'peak', weekStart: 24, weekEnd: 28, weekLabel: '24–28', theme: 'Max race-specific load' },
  { name: 'Taper', id: 'taper', weekStart: 29, weekEnd: 32, weekLabel: '29–32', theme: 'Arrive fresh and sharp' },
];

export const ALL_STATIONS = Object.keys(STATION_META);

export const WKS_WORKOUT_DB = {
  run_quality: {
    id: 'run_quality',
    label: 'Run quality',
    type: 'run',
    duration: 48,
    objective: 'Raise threshold pace and race repeatability.',
    winTheDayTargets: ['Warm-up completed', 'Hit quality paces', 'Cooldown + notes logged'],
    ex: [
      { n: 'Warm-up jog', s: '1', r: '10 min easy + drills' },
      { n: 'Threshold reps', s: '5', r: '3 min hard / 2 min easy' },
      { n: 'Cooldown jog', s: '1', r: '8-10 min' },
    ],
  },
  run_aerobic: {
    id: 'run_aerobic',
    label: 'Aerobic run',
    type: 'run',
    duration: 42,
    objective: 'Build aerobic durability.',
    winTheDayTargets: ['Conversational effort', 'Smooth cadence', 'Post-run mobility 5 min'],
    ex: [
      { n: 'Easy run', s: '1', r: '35-45 min Z2' },
      { n: 'Strides', s: '4', r: '20 sec relaxed-fast' },
    ],
  },
  run_threshold: {
    id: 'run_threshold',
    label: 'Threshold run',
    type: 'run',
    duration: 50,
    objective: 'Push sustainable race pace.',
    winTheDayTargets: ['No pace fade', 'Breathing under control', 'Log average pace'],
    ex: [
      { n: 'Warm-up', s: '1', r: '12 min easy' },
      { n: 'Tempo block', s: '1', r: '25 min comfortably hard' },
      { n: 'Cooldown', s: '1', r: '10 min easy' },
    ],
  },
  strength_upper: {
    id: 'strength_upper',
    label: 'Upper strength',
    type: 'strength',
    duration: 55,
    objective: 'Build pull/press durability for stations.',
    stations: ['SkiErg', 'Row', 'Farmers Carry'],
    winTheDayTargets: ['All prescribed sets', 'No rushed rest', 'Technique above load'],
    ex: [
      { n: 'Bench press', s: '4', r: '6 reps @ RPE 7-8' },
      { n: 'Weighted pull-up', s: '4', r: '5-6 reps' },
      { n: 'SkiErg', s: '4', r: '250m hard' },
      { n: 'Single-arm DB row', s: '3', r: '10 each side' },
    ],
  },
  strength_lower: {
    id: 'strength_lower',
    label: 'Lower strength',
    type: 'strength',
    duration: 60,
    objective: 'Build force for push/pull/lunge demands.',
    stations: ['Sled Push', 'Sled Pull', 'Sandbag Lunges'],
    winTheDayTargets: ['Primary lift completed', 'Sled quality reps', 'Mobility finish'],
    ex: [
      { n: 'Back squat', s: '4', r: '6 reps @ RPE 7-8' },
      { n: 'Romanian deadlift', s: '3', r: '8 reps' },
      { n: 'Sled push', s: '5', r: '40m moderate-heavy' },
      { n: 'Walking lunge', s: '3', r: '10 each leg' },
    ],
  },
  hyrox_functional: {
    id: 'hyrox_functional',
    label: 'HYROX stations',
    type: 'hyrox',
    duration: 62,
    objective: 'Station transitions under fatigue.',
    stations: ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball'],
    winTheDayTargets: ['Steady transitions', 'Controlled breathing', 'Even output by round'],
    ex: [
      { n: 'Run', s: '4', r: '500m @ race effort' },
      { n: 'Sled push', s: '4', r: '25m' },
      { n: 'Sled pull', s: '4', r: '25m' },
      { n: 'Wall ball', s: '4', r: '20 reps' },
    ],
  },
  hyrox_simulation: {
    id: 'hyrox_simulation',
    label: 'HYROX simulation',
    type: 'hyrox',
    duration: 70,
    objective: 'Race specific confidence set.',
    stations: ['SkiErg', 'Burpee Broad Jump', 'Farmers Carry', 'Wall Ball'],
    winTheDayTargets: ['Race pacing discipline', 'No long breaks', 'Recovery protocol complete'],
    ex: [
      { n: 'Run', s: '3', r: '1km @ race pace' },
      { n: 'SkiErg', s: '3', r: '750m' },
      { n: 'Burpee broad jump', s: '3', r: '40m' },
      { n: 'Farmers carry', s: '3', r: '100m' },
      { n: 'Wall ball', s: '3', r: '30 reps' },
    ],
  },
  recovery_mobility: {
    id: 'recovery_mobility',
    label: 'Recovery mobility',
    type: 'recovery',
    duration: 20,
    objective: 'Downshift while preserving movement quality.',
    winTheDayTargets: ['Breathing reset', 'Hips/ankles open', 'Hydration + sleep plan'],
    ex: [
      { n: 'Nasal breathing', s: '1', r: '4 min' },
      { n: 'Mobility flow', s: '1', r: '12 min' },
      { n: 'Walk', s: '1', r: '10 min easy' },
    ],
  },
};

export const WEEKLY_TEMPLATES = {
  A: {
    '4-day': ['strength_upper', 'run_quality', 'strength_lower', 'hyrox_functional'],
    '5-day': ['strength_upper', 'run_quality', 'run_aerobic', 'strength_lower', 'hyrox_functional'],
  },
  B: {
    '4-day': ['run_threshold', 'hyrox_functional', 'run_aerobic', 'strength_lower'],
    '5-day': ['run_quality', 'hyrox_functional', 'run_aerobic', 'strength_lower', 'hyrox_simulation'],
  },
};

const PROGRAM_DAY_OFFSETS = {
  '4-day': [1, 3, 5, 6],
  '5-day': [1, 2, 3, 4, 6],
};

function normalizeTrainingDays(trainingDays) {
  return trainingDays === '5-day' ? '5-day' : '4-day';
}

function normalizeWeekType(weekType, weekNumber) {
  if (weekType === 'A' || weekType === 'B') return weekType;
  return weekNumber % 2 === 1 ? 'A' : 'B';
}

export function toDateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function getPhaseForWeek(weekNumber) {
  const week = Number.isFinite(weekNumber) ? weekNumber : 1;
  return PHASES.find(phase => week >= phase.weekStart && week <= phase.weekEnd) ?? PHASES[PHASES.length - 1];
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

export function getStationMeta(stationKey) {
  if (!stationKey) return null;
  if (STATION_META[stationKey]) return STATION_META[stationKey];
  return Object.values(STATION_META).find(station => station.key === stationKey || station.name === stationKey) ?? null;
}

function stationListForWorkout(workout) {
  return (workout?.stations || []).map(getStationMeta).filter(Boolean);
}

function personalizeWorkout(workout, athlete = {}) {
  if (!workout) return null;
  const weakStations = Array.isArray(athlete.weakStations) ? athlete.weakStations : [];
  const strongStations = Array.isArray(athlete.strongStations) ? athlete.strongStations : [];
  const notes = [];
  if (weakStations.length > 0) notes.push(`Bias quality reps on ${weakStations.slice(0, 2).join(' + ')}.`);
  if (strongStations.length > 0) notes.push(`Use ${strongStations[0]} as confidence anchor.`);

  return {
    ...workout,
    athleteNotes: notes,
    ex: workout.ex.map(item => {
      const isWeakStation = weakStations.some(station => item.n.toLowerCase().includes(String(station).toLowerCase()));
      if (!isWeakStation) return item;
      return { ...item, note: `${item.note ? `${item.note} · ` : ''}Control pace and reduce rest transitions.` };
    }),
  };
}

export function getWksWorkout(workoutKey, athleteDefaults) {
  const baseWorkout = WKS_WORKOUT_DB[workoutKey] || null;
  return personalizeWorkout(baseWorkout, athleteDefaults);
}

export function getWeeklyTemplate({ trainingDays, weekType, weekNumber }) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  return (WEEKLY_TEMPLATES[normalizedWeekType]?.[normalizedDays] ?? []).map(workoutKey => {
    const workout = getWksWorkout(workoutKey);
    return {
      ...workout,
      workoutKey,
      weekType: normalizedWeekType,
      trainingDays: normalizedDays,
      title: workout?.label,
      detail: workout?.objective,
    };
  });
}

export function buildWeeklySchedule({ trainingDays, weekNumber, startDate, weekType, athleteDefaults }) {
  const sessions = getWeeklyTemplate({ trainingDays, weekType, weekNumber });
  const weekStart = assertValidStartDate(startDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + ((weekNumber - 1) * 7));
  const dayOffsets = PROGRAM_DAY_OFFSETS[normalizeTrainingDays(trainingDays)];

  return sessions.map((session, index) => {
    const date = new Date(weekStart);
    const offset = dayOffsets[index] ?? index;
    date.setDate(date.getDate() + offset);
    const personalized = personalizeWorkout(session, athleteDefaults);

    return {
      ...personalized,
      offset,
      week: weekNumber,
      phase: getPhaseForWeek(weekNumber).name,
      date,
      dateKey: toDateKey(date),
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      stations: stationListForWorkout(personalized),
      title: personalized?.label,
      detail: personalized?.objective,
    };
  });
}

export function resolveWeeklyPlanStatus({
  startDate,
  trainingDays,
  weekNumber,
  weekType,
  history = [],
  today = new Date(),
  athleteDefaults,
  carryMissed = true,
}) {
  const todayKey = toDateKey(today);
  const week = weekNumber || getCurrentWeek({ startDate, today });
  const scheduled = buildWeeklySchedule({ trainingDays, weekNumber: week, startDate, weekType, athleteDefaults });

  return scheduled.map((session, index) => {
    const completedLog = history.find(item => item.status === 'completed' && (item.scheduledDate === session.dateKey || item.plannedDate === session.dateKey));
    const skippedLog = history.find(item => item.status === 'skipped' && item.plannedDate === session.dateKey);
    const movedLog = history.find(item => (
      ['planned', 'active', 'completed'].includes(item.status)
      && item.plannedDate === session.dateKey
      && item.scheduledDate
      && item.scheduledDate !== session.dateKey
    ));

    let status = 'planned';
    if (completedLog) status = 'completed';
    else if (skippedLog) status = 'skipped';
    else if (session.dateKey === todayKey) status = 'today';
    else if (session.dateKey < todayKey) status = 'missed';

    let movedToDate = null;
    if (!completedLog && status === 'missed' && carryMissed) {
      const nextSlot = scheduled.slice(index + 1).find(candidate => candidate.dateKey >= todayKey);
      movedToDate = nextSlot?.dateKey || null;
      if (movedToDate) status = 'moved';
    }

    if (movedLog && !completedLog && !skippedLog) {
      status = 'moved';
      movedToDate = movedLog.scheduledDate;
    }

    return {
      ...session,
      status,
      completedLog: completedLog || null,
      movedToDate,
      skippedLog: skippedLog || null,
      isToday: session.dateKey === todayKey,
      isPlanned: status === 'planned' || status === 'today',
      isMissed: status === 'missed',
      isMoved: status === 'moved',
      isSkipped: status === 'skipped',
      isCompleted: status === 'completed',
    };
  });
}

export function getTodayResolvedWorkout({ startDate, trainingDays, today = new Date(), history = [], athleteDefaults }) {
  const week = getCurrentWeek({ startDate, today });
  const weekType = normalizeWeekType(null, week);
  const resolvedWeek = resolveWeeklyPlanStatus({
    startDate,
    trainingDays,
    weekNumber: week,
    weekType,
    history,
    today,
    athleteDefaults,
    carryMissed: true,
  });
  return resolvedWeek.find(session => session.status === 'today' || (session.status === 'moved' && session.movedToDate === toDateKey(today))) ?? null;
}

export function getPlanState({ startDate, trainingDays, today = new Date(), history = [], athleteDefaults }) {
  const week = getCurrentWeek({ startDate, today });
  const phase = getPhaseForWeek(week);
  const weekType = week % 2 === 1 ? 'A' : 'B';
  const sessions = resolveWeeklyPlanStatus({ startDate, trainingDays, weekNumber: week, weekType, history, today, athleteDefaults, carryMissed: true });

  return {
    week,
    phase,
    weekType,
    sessions,
    label: `Week ${week} · ${phase.name}`,
  };
}
