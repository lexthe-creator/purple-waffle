import { ALL_STATIONS, getStationMeta } from './hyroxPlan.js';

export const QUICK_MEAL_TAGS = ['protein', 'carbs', 'veg', 'quick'];

export const NUTRITION_SLOTS = [
  {
    id: 'breakfast',
    label: 'Breakfast',
    keywords: ['breakfast', 'brunch', 'oat', 'oats', 'egg', 'eggs', 'yogurt', 'smoothie', 'coffee'],
  },
  {
    id: 'lunch',
    label: 'Lunch',
    keywords: ['lunch', 'sandwich', 'salad', 'wrap', 'bowl', 'rice', 'chicken'],
  },
  {
    id: 'dinner',
    label: 'Dinner',
    keywords: ['dinner', 'supper', 'pasta', 'salmon', 'steak', 'curry', 'taco'],
  },
  {
    id: 'snacks',
    label: 'Snacks',
    keywords: ['snack', 'snacks', 'bar', 'fruit', 'protein', 'bite', 'nuts'],
  },
];

export const DEFAULT_ATHLETE = {
  fiveKTime: null,
  hyroxFinishTime: null,
  weakStations: [],
  strongStations: [],
  squat5RM: null,
  deadlift5RM: null,
  wallBallMaxReps: null,
  preferredTrainingDays: ['Mon', 'Wed', 'Fri', 'Sat'],
  programType: '4-day',
};

export const RECOVERY_SESSIONS = [
  {
    id: 'fullbody',
    name: 'Full body reset',
    when: 'After any strength session or rest day',
    dur: '18 min',
    moves: ['Neck rolls', 'Cross-body shoulder stretch', 'Standing forward fold', 'Hip flexor lunge', 'Pigeon pose', 'Seated hamstring stretch', 'Supine spinal twist', "Child's pose"],
  },
  {
    id: 'runner',
    name: 'Runner recovery',
    when: 'After any run or the day after a long run',
    dur: '16 min',
    moves: ['Standing calf stretch', 'Achilles low lunge', 'Standing quad stretch', 'Hip flexor lunge', 'Hamstring stretch', 'IT band stretch', 'Figure four — glute', 'Forward fold release'],
  },
  {
    id: 'upper',
    name: 'Upper body mobility',
    when: 'After upper body strength, SkiErg or row sessions',
    dur: '12 min',
    moves: ['Neck side stretch', 'Cross-body shoulder stretch', 'Doorway chest stretch', 'Overhead lat stretch', 'Thoracic extension', 'Wrist flexor stretch', "Child's pose wide arms"],
  },
  {
    id: 'lower',
    name: 'Lower body mobility',
    when: 'After leg day, HYROX sim, or before a long run',
    dur: '17 min',
    moves: ['Standing quad stretch', 'Deep hip flexor lunge', 'Half splits', 'Seated butterfly', 'Frog stretch', 'Pigeon pose', 'Happy baby'],
  },
  {
    id: 'raceweek',
    name: 'Race week mobility',
    when: 'Daily during taper week',
    dur: '20 min',
    moves: ['Full body shake out', 'Hip flexor lunge', 'Pigeon pose', 'Thoracic rotation', 'Ankle circles + calf', 'Standing forward fold', 'Supine twist', 'Legs up the wall'],
  },
  {
    id: 'sleep',
    name: 'Sleep wind down',
    when: 'Evening before bed, especially before hard training',
    dur: '15 min',
    moves: ['Breathwork 4-4-6', 'Neck and shoulder release', 'Reclined butterfly', 'Reclined spinal twist', 'Legs up the wall', 'Savasana'],
  },
];

export const SAVED_MEALS = [
  { meal: 'Protein shake', cal: 150, pro: 30, carb: 8 },
  { meal: 'Chicken + rice bowl', cal: 560, pro: 55, carb: 65 },
  { meal: 'Greek yogurt + berries', cal: 165, pro: 17, carb: 22 },
  { meal: '2 eggs on toast', cal: 280, pro: 18, carb: 28 },
  { meal: 'Protein bar', cal: 220, pro: 20, carb: 26 },
  { meal: 'Cottage cheese + fruit', cal: 200, pro: 25, carb: 18 },
  { meal: 'Oats + banana + PB', cal: 420, pro: 15, carb: 62 },
  { meal: 'Tuna wrap', cal: 380, pro: 38, carb: 30 },
];

export function fmtPaceMi(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${minutes}:${String(secs).padStart(2, '0')} /mi`;
}

export function computePaces(fiveKMin) {
  if (!fiveKMin || fiveKMin <= 0) return null;
  const sec = (fiveKMin * 60) / 3.107;
  return {
    easySec: sec + 105,
    threshSec: sec + 25,
    intSec: sec - 7.5,
    easy: fmtPaceMi(sec + 105),
    threshold: fmtPaceMi(sec + 25),
    interval: fmtPaceMi(sec - 7.5),
    race5k: fmtPaceMi(sec),
  };
}

export function getPhaseByWeeks(weeksRemaining) {
  if (weeksRemaining <= 0) return { name: 'Race Week', code: 'race' };
  if (weeksRemaining <= 3) return { name: 'Taper', code: 'taper' };
  if (weeksRemaining <= 4) return { name: 'Peak', code: 'peak' };
  if (weeksRemaining <= 8) return { name: 'Build', code: 'build' };
  return { name: 'Base', code: 'base' };
}

export function getLongRunDur(code, weekInPhase) {
  if (code === 'race') return 20;
  if (code === 'taper') return ({ 1: 50, 2: 35, 3: 20 })[weekInPhase] || 30;
  if (code === 'peak') return 72;
  if (code === 'build') return Math.min(40 + (weekInPhase || 1) * 5, 60);
  return ({ 1: 30, 2: 32, 3: 35, 4: 45, 5: 48, 6: 52, 7: 60, 8: 62 })[weekInPhase] || 35;
}

export function computeRecoveryState(todayLog, fallbackEnergy = 5, fallbackSleep = 7.5) {
  const energy = todayLog?.energyScore ?? fallbackEnergy;
  const sleep = todayLog?.sleepHours ?? fallbackSleep;
  const readiness = todayLog?.readiness ?? Math.max(58, Math.min(96, Math.round((sleep || 7) * 9 + (Math.round((energy || 6) / 2) * 5))));
  if (readiness >= 85 && energy >= 7) return { level: 'High', readiness, energy, sleep };
  if (readiness >= 70 && energy >= 5) return { level: 'Moderate', readiness, energy, sleep };
  return { level: 'Low', readiness, energy, sleep };
}

function deriveWorkoutCategory(session) {
  if (!session) return 'mobility';
  if (session.type === 'run' || (session.name || '').toLowerCase().includes('run')) return 'running';
  const text = `${session.name || ''} ${session.purpose || ''}`.toLowerCase();
  if (/hyrox|simulation|station/.test(text)) return 'hyrox';
  if (/upper|pull|press/.test(text)) return 'upper_strength';
  if (/lower|squat|deadlift|lunge/.test(text)) return 'lower_strength';
  if (/recovery|mobility|pilates/.test(text)) return 'mobility';
  return 'lower_strength';
}

function buildSimpleExercise(name, detail) {
  return {
    id: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    detail,
    sets: null,
    reps: null,
    duration: null,
    completed: false,
  };
}

export function getExerciseMeta(name) {
  const meta = getStationMeta(name);
  if (meta) {
    return {
      id: meta.key,
      name: meta.name,
      type: 'hyrox',
      category: 'HYROX station',
      muscleGroup: 'Full body',
      equipment: 'Race implement',
      instructions: `Work the ${meta.name.toLowerCase()} with race-day control.`,
      alternatives: ALL_STATIONS.filter(station => station !== meta.name).slice(0, 4),
      tags: ['hyrox'],
      pattern: 'hyrox_station',
      defaultRest: 45,
      logType: 'duration',
      coachingNotes: '',
    };
  }

  const normalized = `${name || ''}`.toLowerCase();
  if (/run|interval|tempo|threshold/.test(normalized)) {
    return {
      id: normalized.replace(/\W+/g, '_') || 'run',
      name,
      type: 'cardio',
      category: 'Run',
      muscleGroup: 'Cardio',
      equipment: 'Shoes',
      instructions: 'Hit the prescribed effort and log the actual distance or pace.',
      alternatives: [],
      tags: ['run'],
      pattern: 'cardio',
      defaultRest: 45,
      logType: 'duration',
      coachingNotes: '',
    };
  }

  return {
    id: normalized.replace(/\W+/g, '_') || 'strength',
    name,
    type: 'strength',
    category: 'Strength',
    muscleGroup: 'General',
    equipment: 'Gym',
    instructions: 'Follow the prescribed reps and use clean mechanics.',
    alternatives: [],
    tags: ['strength'],
    pattern: 'general_strength',
    defaultRest: 75,
    logType: 'weight_reps',
    coachingNotes: '',
  };
}

function getLogTypeForExercise(raw, meta) {
  if (meta.logType) return meta.logType;
  if (/m|km/i.test(raw?.r || '')) return 'distance';
  if (/s|min/i.test(raw?.r || '')) return 'duration';
  return 'weight_reps';
}

function parseTargetNumber(value, fallback = 3) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : fallback;
}

function buildExerciseInstance(raw, index) {
  const meta = getExerciseMeta(raw.n || raw.name || `Exercise ${index + 1}`);
  const logType = getLogTypeForExercise(raw, meta);
  return {
    id: `${meta.id}-${index}`,
    exerciseId: meta.id,
    n: raw.n || raw.name || meta.name,
    displayName: meta.name || raw.n,
    category: meta.category,
    muscleGroup: meta.muscleGroup,
    equipment: meta.equipment,
    instructions: meta.instructions,
    coachingNotes: raw.note || meta.coachingNotes || '',
    alternatives: meta.alternatives || [],
    tags: meta.tags || [],
    pattern: meta.pattern || 'general_strength',
    defaultRest: meta.defaultRest || 75,
    logType,
    targetSets: parseTargetNumber(raw.s, 3),
    targetReps: raw.r || '',
    targetNote: raw.note || '',
    supersetKey: raw.supersetKey || null,
  };
}

export function hydrateWorkoutSession(session) {
  if (!session) return null;
  const exercises = (session.ex || session.exercises || []).map((raw, index) => {
    if (raw.exerciseId) return raw;
    const built = buildExerciseInstance(raw, index);
    const targetSets = built.targetSets || 3;
    const setLogs = Array.from({ length: targetSets }, (_, setIndex) => ({
      idx: setIndex + 1,
      weight: '',
      reps: '',
      distance: '',
      duration: '',
      rpe: '',
      notes: '',
      done: false,
    }));
    return { ...built, setLogs };
  });

  return {
    ...session,
    ex: exercises,
    exercises,
    currentExerciseIdx: session.currentExerciseIdx || 0,
    startedAt: session.startedAt || Date.now(),
    inProgress: true,
  };
}

export function adjustWorkoutForRecovery(session, recovery) {
  if (!session) return null;
  if (recovery?.level === 'Low') {
    const recoveryName = session.type === 'run' ? 'Active Recovery Cardio' : 'Mobility Reset';
    return hydrateWorkoutSession({
      id: `${session.id}-recovery`,
      name: recoveryName,
      type: 'recovery',
      duration: 20,
      purpose: 'Reduce load and keep the day moving.',
      adjustmentLabel: 'Recovery Replacement',
      originalName: session.name,
      ex: [buildSimpleExercise('Breathing drills', 'Slow nasal breathing'), buildSimpleExercise('Mobility flow', 'Hips, shoulders, and ankles')],
    });
  }

  if (recovery?.level === 'Moderate') {
    return hydrateWorkoutSession({
      ...session,
      name: `${session.name} (Reduced Volume)`,
      adjustmentLabel: 'Reduced Volume',
      ex: (session.ex || []).slice(0, Math.max(1, session.ex.length - 1)),
    });
  }

  return hydrateWorkoutSession({ ...session, adjustmentLabel: 'Planned Session' });
}

export function getSwapCandidates(exercise) {
  const title = `${exercise?.n || exercise?.displayName || ''}`.toLowerCase();
  if (/squat/.test(title)) return ['Goblet squat', 'Leg press', 'Bulgarian split squat'];
  if (/row/.test(title)) return ['Cable row', 'Lat pulldown', 'Single-arm DB row'];
  if (/press|bench/.test(title)) return ['Barbell bench press', 'Push-ups', 'Cable fly'];
  if (/run/.test(title)) return ['Easy bike 3 min', 'Row 250m', 'SkiErg 250m'];
  if (/carry/.test(title)) return ['KB carry', 'DB carry', 'Suitcase carry'];
  return [];
}

export function generateWorkout(type, phaseCode, paces, athlete) {
  const wallBallReps = athlete?.wallBallMaxReps ? Math.min(athlete.wallBallMaxReps, 30) : 20;
  if (type === 'run_aerobic' || type === 'run_easy') {
    return {
      type: 'run',
      focus: 'Aerobic base',
      warmup: '5 min easy walk or jog',
      mainSet: `30 min easy run ${paces ? `@ ${paces.easy}` : 'at conversational pace'}`,
      cooldown: '5 min walk',
      duration: getLongRunDur(phaseCode, 1),
      estimatedCalories: 280,
    };
  }

  if (type === 'run_intervals') {
    return {
      type: 'run',
      focus: 'Speed & VO2',
      warmup: '10 min easy jog',
      mainSet: `5 x 3 min ${paces ? `@ ${paces.interval}` : 'hard effort'}\n2 min easy jog between each`,
      cooldown: '10 min easy jog',
      duration: 40,
      estimatedCalories: 420,
    };
  }

  if (type === 'run_threshold') {
    return {
      type: 'run',
      focus: 'Lactate threshold',
      warmup: '10 min easy',
      mainSet: `25 min ${paces ? `@ ${paces.threshold}` : 'comfortably hard effort'}`,
      cooldown: '10 min easy',
      duration: 45,
      estimatedCalories: 380,
    };
  }

  if (type === 'strength_upper') {
    return {
      type: 'strength',
      focus: 'Upper body',
      warmup: '5 min easy row or SkiErg',
      mainSet: [
        'Bench press 4 x 6',
        'Weighted pull-up 4 x 6',
        'SkiErg 4 x 250m',
        'Single-arm row 3 x 10 each side',
        'Farmers carry 3 x 50m',
      ].join('\n'),
      cooldown: '5 min upper body stretch',
      duration: 55,
      estimatedCalories: 310,
    };
  }

  if (type === 'strength_lower') {
    return {
      type: 'strength',
      focus: 'Lower body',
      warmup: '5 min easy bike or squat mobility',
      mainSet: [
        'Back squat 4 x 6',
        'Romanian deadlift 3 x 8',
        'Sled push 4 x 50m',
        'Walking lunges 3 x 10 each leg',
        'Hip thrust 3 x 10',
      ].join('\n'),
      cooldown: '5 min lower body stretch',
      duration: 60,
      estimatedCalories: 340,
    };
  }

  if (type === 'strength_circuit') {
    return {
      type: 'strength',
      focus: 'Full body circuit',
      warmup: '5 min row',
      mainSet: [
        'Trap bar deadlift 4 x 5',
        'Dumbbell bench press 3 x 10',
        'Kettlebell swings 4 x 15',
        'Farmers carry 4 x 40m',
        `Wall ball 3 x ${wallBallReps}`,
      ].join('\n'),
      cooldown: '5 min mobility',
      duration: 55,
      estimatedCalories: 350,
    };
  }

  if (type === 'hyrox_functional' || type === 'hyrox_simulation') {
    return {
      type: 'hybrid',
      focus: type === 'hyrox_simulation' ? 'HYROX simulation' : 'HYROX station circuit',
      warmup: '10 min easy jog',
      mainSet: [
        type === 'hyrox_simulation' ? '3 rounds:' : '4 rounds:',
        `  ${type === 'hyrox_simulation' ? '0.6 mi' : '250m'} run`,
        `  ${wallBallReps} wall balls`,
        '  40m farmers carry',
        '  10 burpee broad jumps',
        '  20m sandbag lunges',
      ].join('\n'),
      cooldown: '5 min walk + stretch',
      duration: type === 'hyrox_simulation' ? 45 : 65,
      estimatedCalories: type === 'hyrox_simulation' ? 380 : 480,
    };
  }

  return {
    type: 'recovery',
    focus: 'Recovery',
    warmup: '5 min walk',
    mainSet: '20 min easy mobility flow',
    cooldown: '5 min breathing reset',
    duration: 20,
    estimatedCalories: 100,
  };
}

export function computeWeeklyAnalytics(history, weekStart) {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const weekEntries = history.filter(entry => {
    const date = new Date(`${entry.date}T12:00:00`);
    return date >= start && date < end;
  });

  let runMiles = 0;
  let runMins = 0;
  let strengthSessions = 0;
  let hyroxSessions = 0;
  let estimatedCalories = 0;

  for (const entry of weekEntries) {
    if (entry.type === 'run') {
      runMins += 30;
      runMiles += entry.data?.dist2 ? Number.parseFloat(entry.data.dist2) || 0 : 3;
    } else if (entry.type === 'workout') {
      strengthSessions += 1;
    } else if (entry.type === 'hyrox') {
      hyroxSessions += 1;
    }
    estimatedCalories += entry.data?.calories || 0;
  }

  const totalMinutes = weekEntries.reduce((sum, entry) => sum + (entry.type === 'run' ? 30 : entry.type === 'workout' ? 50 : 40), 0);

  return {
    runMiles: Number(runMiles.toFixed(1)),
    runMins,
    strengthSessions,
    hyroxSessions,
    totalMinutes,
    estimatedCalories: Math.max(estimatedCalories, Math.round(totalMinutes * 8.5)),
    sessionsLogged: weekEntries.length,
  };
}

export function getWorkoutLogForPlan(plan, history) {
  if (!plan) return null;
  return (history || []).find(entry => {
    if (entry.type !== 'workout' && entry.type !== 'run' && entry.type !== 'hyrox') return false;
    const plannedDate = entry.data?.plannedDate || entry.plannedDate;
    if (plannedDate) return plannedDate === plan.plannedDate;
    return entry.date === plan.plannedDate;
  }) || null;
}

export function getTrainingDayFlags(dayOfWeek, programType = '4-day', preferredTrainingDays) {
  const normalized = programType === '5-day' ? '5-day' : '4-day';
  const defaultTrainingDays = normalized === '5-day' ? [1, 2, 3, 4, 6] : [1, 3, 5, 6];
  const dayIndexToLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const preferredLabels = Array.isArray(preferredTrainingDays) && preferredTrainingDays.length
    ? preferredTrainingDays
    : defaultTrainingDays.map(index => dayIndexToLabel[index]);
  const seen = new Set();
  const trainingDays = preferredLabels
    .map(label => dayIndexToLabel.indexOf(label))
    .filter(index => index >= 0 && !seen.has(index) && seen.add(index));
  const fallbackTrainingDays = trainingDays.length ? trainingDays : defaultTrainingDays;
  const canonicalSlots = normalized === '5-day'
    ? ['mon', 'tue', 'wed', 'thu', 'sat']
    : ['mon', 'wed', 'fri', 'sat'];
  const daySlot = fallbackTrainingDays.includes(dayOfWeek)
    ? canonicalSlots[Math.max(0, fallbackTrainingDays.indexOf(dayOfWeek))]
    : null;

  return {
    trainingDays: fallbackTrainingDays,
    isTrainingDay: fallbackTrainingDays.includes(dayOfWeek),
    daySlot,
    isRunDay: daySlot === 'tue' || daySlot === 'wed',
    isLongDay: daySlot === 'sat',
    isThursdayStrengthDay: daySlot === 'thu',
  };
}

export function isTrainingDayForDate(dateStr, programType = '4-day', preferredTrainingDays) {
  const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
  return getTrainingDayFlags(dayOfWeek, programType, preferredTrainingDays).isTrainingDay;
}

function getTodayWorkout(weekType, phaseIndex, flags) {
  if (!flags?.isTrainingDay) return null;
  const key = `p${phaseIndex}${weekType || 'A'}`;
  if (flags.daySlot === 'sat') return { name: 'Long run or stations', type: 'run' };
  if (flags.daySlot === 'thu') return { name: 'Upper body pull', type: 'strength' };
  if (flags.daySlot === 'tue') return { name: 'Recovery run', type: 'run' };
  if (flags.daySlot === 'wed') return { name: 'Run quality', type: 'run' };
  if (flags.daySlot === 'mon') return { name: 'Strength + stations', type: 'strength' };
  if (flags.daySlot === 'fri') return { name: 'HYROX simulation', type: 'hyrox' };
  return { name: key, type: 'strength' };
}

export function getPlannedWorkoutForDate(dateStr, weekType, phaseIndex, programType = '4-day', preferredTrainingDays) {
  const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay();
  const flags = getTrainingDayFlags(dayOfWeek, programType, preferredTrainingDays);
  const session = getTodayWorkout(weekType, phaseIndex, flags);
  if (!session) return null;
  return {
    ...session,
    plannedDate: dateStr,
    plannedDayLabel: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
    plannedSlot: flags.daySlot,
    plannedName: session.name,
  };
}

export function resolveWeeklyTrainingPlan(weekStart, weekType, phaseIndex, programType = '4-day', preferredTrainingDays, history, todayStr = new Date().toISOString().slice(0, 10)) {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }).reduce((accumulator, dateStr) => {
    const planned = getPlannedWorkoutForDate(dateStr, weekType, phaseIndex, programType, preferredTrainingDays);
    if (!planned) return accumulator;
    const completedLog = getWorkoutLogForPlan(planned, history);
    const status = completedLog
      ? (completedLog.date === planned.plannedDate ? 'completed' : 'moved')
      : dateStr < todayStr
        ? 'missed'
        : dateStr === todayStr
          ? 'today'
          : 'planned';

    accumulator.push({
      ...planned,
      completedLog,
      completedDate: completedLog?.date || null,
      status,
      moved: Boolean(completedLog && completedLog.date !== planned.plannedDate),
      moveLabel: completedLog && completedLog.date !== planned.plannedDate
        ? `Moved to ${new Date(`${completedLog.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
        : null,
    });
    return accumulator;
  }, []);
}

export function workoutStationsForSession(session) {
  const key = session?.type === 'hyrox' || /hyrox/i.test(session?.name || '') ? 'hyrox' : session?.type === 'run' ? 'running' : 'strength';
  if (key === 'hyrox') return ALL_STATIONS.map(name => getStationMeta(name)).filter(Boolean);
  return [];
}

