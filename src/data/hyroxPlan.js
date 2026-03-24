import {
  generateHyroxWorkoutSchedule,
  generateHyroxWeeklyWorkoutSelection,
} from './hyroxWorkoutGenerator.js';
import { sessionTypes } from './workoutSystemSchema.js';

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
  { id: 'foundation', name: 'Base', weekStart: 1, weekEnd: 8, weekLabel: '1–8', theme: 'Movement prep and aerobic base' },
  { id: 'base', name: 'Build', weekStart: 9, weekEnd: 16, weekLabel: '9–16', theme: 'Build sustainable volume' },
  { id: 'build', name: 'Specificity', weekStart: 17, weekEnd: 23, weekLabel: '17–23', theme: 'Raise specificity and workload' },
  { id: 'peak', name: 'Peak', weekStart: 24, weekEnd: 28, weekLabel: '24–28', theme: 'Race-specific sharpening' },
  { id: 'peak', name: 'Taper', weekStart: 29, weekEnd: 32, weekLabel: '29–32', theme: 'Reduce fatigue and consolidate adaptation' },
];

export const ALL_STATIONS = Object.keys(STATION_META);

const SESSION_TYPE_COMPATIBILITY_ALIASES = {
  // Temporary aliases to preserve existing caller keys while schema uses normalized names.
  run_quality: 'run_intervals',
  run_threshold: 'run_tempo',
  run_aerobic: 'run_easy',
  hyrox_functional: 'conditioning_hyrox',
  hyrox_simulation: 'conditioning_circuit',
  recovery_mobility: 'recovery_walk_mobility',
};

const SESSION_TYPE_DETAILS = {
  run_intervals: {
    ex: [
      { n: 'Warm-up jog', s: '1', r: '10 min easy + drills' },
      { n: 'Threshold reps', s: '5', r: '3 min hard / 2 min easy' },
      { n: 'Cooldown jog', s: '1', r: '8-10 min' },
    ],
  },
  run_easy: {
    ex: [
      { n: 'Easy run', s: '1', r: '35-45 min Z2' },
      { n: 'Strides', s: '4', r: '20 sec relaxed-fast' },
    ],
  },
  run_tempo: {
    ex: [
      { n: 'Warm-up', s: '1', r: '12 min easy' },
      { n: 'Tempo block', s: '1', r: '25 min comfortably hard' },
      { n: 'Cooldown', s: '1', r: '10 min easy' },
    ],
  },
  strength_upper: {
    ex: [
      { n: 'Bench press', s: '4', r: '6 reps @ RPE 7-8' },
      { n: 'Weighted pull-up', s: '4', r: '5-6 reps' },
      { n: 'SkiErg', s: '4', r: '250m hard' },
      { n: 'Single-arm DB row', s: '3', r: '10 each side' },
    ],
  },
  strength_lower: {
    ex: [
      { n: 'Back squat', s: '4', r: '6 reps @ RPE 7-8' },
      { n: 'Romanian deadlift', s: '3', r: '8 reps' },
      { n: 'Sled push', s: '5', r: '40m moderate-heavy' },
      { n: 'Walking lunge', s: '3', r: '10 each leg' },
    ],
  },
  conditioning_hyrox: {
    ex: [
      { n: 'Run', s: '4', r: '500m @ race effort' },
      { n: 'Sled push', s: '4', r: '25m' },
      { n: 'Sled pull', s: '4', r: '25m' },
      { n: 'Wall ball', s: '4', r: '20 reps' },
    ],
  },
  conditioning_circuit: {
    ex: [
      { n: 'Run', s: '3', r: '1km @ race pace' },
      { n: 'SkiErg', s: '3', r: '750m' },
      { n: 'Burpee broad jump', s: '3', r: '40m' },
      { n: 'Farmers carry', s: '3', r: '100m' },
      { n: 'Wall ball', s: '3', r: '30 reps' },
    ],
  },
  recovery_walk_mobility: {
    ex: [
      { n: 'Nasal breathing', s: '1', r: '4 min' },
      { n: 'Mobility flow', s: '1', r: '12 min' },
      { n: 'Walk', s: '1', r: '10 min easy' },
    ],
  },
};

export const HYROX_SCHEDULE_PHASE_MAP = {
  Base: 'foundation',
  Build: 'base',
  Specificity: 'build',
  Peak: 'peak',
  Taper: 'peak',
};

function toLegacyWorkoutShape(sessionType) {
  if (!sessionType) return null;
  const details = SESSION_TYPE_DETAILS[sessionType.sessionTypeId];
  return {
    id: sessionType.sessionTypeId,
    label: sessionType.displayName,
    type: sessionType.category,
    duration: sessionType.duration,
    objective: sessionType.objective,
    stations: sessionType.stations,
    winTheDayTargets: sessionType.winTheDayTargets || [],
    // Assumption: only legacy sessions have detailed exercise blocks in PR 1.5.
    ex: details?.ex || [{ n: sessionType.displayName, s: '1', r: 'See template details' }],
  };
}

const normalizedWorkouts = Object.fromEntries(
  Object.entries(sessionTypes).map(([key, value]) => [key, toLegacyWorkoutShape(value)]),
);

export const WKS_WORKOUT_DB = {
  ...normalizedWorkouts,
  ...Object.fromEntries(
    Object.entries(SESSION_TYPE_COMPATIBILITY_ALIASES).map(([legacyKey, normalizedKey]) => [legacyKey, normalizedWorkouts[normalizedKey]]),
  ),
};
const PROGRAM_DAY_OFFSETS = {
  '4-day': [1, 3, 5, 6],
  '5-day': [1, 2, 3, 4, 6],
};

const HYROX_SESSION_LABELS = {
  hyrox_functional: 'Functional',
  hyrox_simulation: 'Simulation',
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

function formatHyroxSessionLabel(workout) {
  const phaseLabel = workout?.phaseLabel || String(workout?.phaseType || '').trim() || 'HYROX';
  const sessionLabel = HYROX_SESSION_LABELS[workout?.sessionType] || workout?.sessionTypeCanonical || 'Workout';
  return `${phaseLabel} ${sessionLabel}`.trim();
}

function mapHyroxWorkoutStructureToExercises(workout) {
  return (workout?.structure || []).map((block, index) => ({
    n: block.name || `Block ${index + 1}`,
    s: String(block.durationMinutes ?? 1),
    r: block.details || '',
    note: Array.isArray(block.stationsUsed) && block.stationsUsed.length > 0
      ? `Stations: ${block.stationsUsed.join(', ')}`
      : '',
  }));
}

function hydrateHyroxWorkoutSession(workout, {
  weekNumber,
  weekType,
  trainingDays,
  dateKey = null,
  date = null,
  offset = null,
  dayLabel = null,
  dateLabel = null,
} = {}) {
  if (!workout) return null;

  const sessionType = workout.sessionType || 'hyrox_functional';
  const phase = workout.schedulePhaseType || HYROX_SCHEDULE_PHASE_MAP[workout.phaseType] || getPhaseForWeek(weekNumber).name;
  const label = formatHyroxSessionLabel(workout);
  const detailStations = Array.isArray(workout.hyroxStationsUsed) && workout.hyroxStationsUsed.length > 0
    ? workout.hyroxStationsUsed.slice(0, 3).join(', ')
    : 'HYROX stations';

  return {
    ...workout,
    id: workout.workoutId,
    workoutKey: workout.workoutId,
    label,
    title: workout.workoutId,
    detail: `${workout.durationMinutes} min · ${workout.intensity} · ${detailStations}`,
    objective: workout.shortVersionRule,
    type: 'hyrox',
    duration: workout.durationMinutes,
    ex: mapHyroxWorkoutStructureToExercises(workout),
    stations: Array.isArray(workout.hyroxStationsUsed) ? [...workout.hyroxStationsUsed] : [],
    phase,
    week: Number.isFinite(weekNumber) ? weekNumber : null,
    weekType: weekType || null,
    trainingDays,
    date,
    dateKey,
    offset,
    dayLabel,
    dateLabel,
    sessionType,
    schedulePhaseType: phase,
  };
}

function generateHyroxWeekSessions({ trainingDays, weekType, weekNumber, schedulePhase }) {
  return generateHyroxWeeklyWorkoutSelection({
    trainingDays,
    weekType,
    weekNumber,
    schedulePhase,
  }).map(workout => hydrateHyroxWorkoutSession(workout, {
    trainingDays,
    weekType,
    weekNumber,
  }));
}

export function getWksWorkout(workoutKey, athleteDefaults) {
  const baseWorkout = WKS_WORKOUT_DB[workoutKey] || null;
  return personalizeWorkout(baseWorkout, athleteDefaults);
}

export function getWeeklyTemplate({ trainingDays, weekType, weekNumber }) {
  // Compatibility adapter: callers still receive a hydrated weekly array, but
  // the sessions now come from the generator instead of a static template map.
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  return generateHyroxWeekSessions({
    trainingDays: normalizedDays,
    weekType: normalizedWeekType,
    weekNumber,
    schedulePhase: getPhaseForWeek(weekNumber).name,
  });
}

export function buildWeeklySchedule({ trainingDays, weekNumber, startDate, weekType, athleteDefaults }) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  const schedulePhase = getPhaseForWeek(weekNumber).name;
  const sessions = generateHyroxWorkoutSchedule({
    trainingDays: normalizedDays,
    weekType: normalizedWeekType,
    weekNumber,
    schedulePhase,
  }).map(session => hydrateHyroxWorkoutSession(session, {
    trainingDays: normalizedDays,
    weekType: normalizedWeekType,
    weekNumber,
  }));
  const weekStart = assertValidStartDate(startDate);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + ((weekNumber - 1) * 7));
  const dayOffsets = PROGRAM_DAY_OFFSETS[normalizedDays];

  return sessions.map((session, index) => {
    const date = new Date(weekStart);
    const offset = dayOffsets[index] ?? index;
    date.setDate(date.getDate() + offset);
    const hydrated = hydrateHyroxWorkoutSession(session, {
      trainingDays: normalizedDays,
      weekType: normalizedWeekType,
      weekNumber,
      date,
      dateKey: toDateKey(date),
      offset,
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
    const personalized = personalizeWorkout(hydrated, athleteDefaults);

    return {
      ...personalized,
      offset,
      week: weekNumber,
      phase: schedulePhase,
      date,
      dateKey: toDateKey(date),
      dayLabel: date.toLocaleDateString('en-US', { weekday: 'short' }),
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      stations: stationListForWorkout(personalized),
      title: personalized?.label,
      detail: personalized?.detail,
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
