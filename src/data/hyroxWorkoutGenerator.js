import { HYROX_WORKOUT_LIBRARY } from './hyroxWorkoutLibrary.js';
import {
  HYROX_LIBRARY_PHASE_TO_SCHEDULE_PHASE,
  HYROX_SCHEDULE_PHASE_TO_LIBRARY_PHASE,
  mapSchedulePhaseToLibraryPhase,
} from './hyroxAdapters.js';

const HYROX_TRAINING_DAY_SLOT_COUNTS = {
  '4-day': 4,
  '5-day': 5,
};

const HYROX_SCHEDULE_PHASE_WINDOWS = {
  Base: { schedulePhase: 'Base', libraryPhase: 'foundation', startWeek: 1, endWeek: 8 },
  Build: { schedulePhase: 'Build', libraryPhase: 'base', startWeek: 9, endWeek: 16 },
  Specificity: { schedulePhase: 'Specificity', libraryPhase: 'build', startWeek: 17, endWeek: 23 },
  Peak: { schedulePhase: 'Peak', libraryPhase: 'peak', startWeek: 24, endWeek: 28 },
  Taper: { schedulePhase: 'Taper', libraryPhase: 'peak', startWeek: 29, endWeek: 32 },
};

const HYROX_PHASE_SESSION_SLOT_PATTERNS = {
  foundation: {
    A: {
      '4-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional'],
    },
    B: {
      '4-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional', 'hyrox_functional'],
    },
  },
  base: {
    A: {
      '4-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
    },
    B: {
      '4-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
    },
  },
  build: {
    A: {
      '4-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
      '5-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
    },
    B: {
      '4-day': ['hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
      '5-day': ['hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
    },
  },
  peak: {
    A: {
      '4-day': ['hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
      '5-day': ['hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
    },
    B: {
      '4-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
      '5-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
    },
  },
};

function normalizeTrainingDays(trainingDays) {
  return trainingDays === '5-day' ? '5-day' : '4-day';
}

function normalizeWeekType(weekType, weekNumber) {
  if (weekType === 'A' || weekType === 'B') return weekType;
  return Number.isFinite(weekNumber) && weekNumber % 2 === 0 ? 'B' : 'A';
}

function resolveLibraryPhase({ phaseType, schedulePhase }) {
  if (phaseType && HYROX_WORKOUT_LIBRARY[phaseType]) {
    return phaseType;
  }

  if (schedulePhase) {
    return HYROX_SCHEDULE_PHASE_TO_LIBRARY_PHASE[schedulePhase]
      || mapSchedulePhaseToLibraryPhase(schedulePhase)
      || null;
  }

  return null;
}

function getPhaseWindow(schedulePhase, weekNumber) {
  const resolvedWindow = HYROX_SCHEDULE_PHASE_WINDOWS[schedulePhase] || null;
  if (resolvedWindow) return resolvedWindow;

  const fallbackLibraryPhase = mapSchedulePhaseToLibraryPhase(schedulePhase);
  const matchingWindow = Object.values(HYROX_SCHEDULE_PHASE_WINDOWS).find(window => window.libraryPhase === fallbackLibraryPhase);
  if (matchingWindow) return matchingWindow;

  if (Number.isFinite(weekNumber) && weekNumber >= 1 && weekNumber <= 8) return HYROX_SCHEDULE_PHASE_WINDOWS.Base;
  if (Number.isFinite(weekNumber) && weekNumber >= 9 && weekNumber <= 16) return HYROX_SCHEDULE_PHASE_WINDOWS.Build;
  if (Number.isFinite(weekNumber) && weekNumber >= 17 && weekNumber <= 23) return HYROX_SCHEDULE_PHASE_WINDOWS.Specificity;
  if (Number.isFinite(weekNumber) && weekNumber >= 24 && weekNumber <= 28) return HYROX_SCHEDULE_PHASE_WINDOWS.Peak;
  return HYROX_SCHEDULE_PHASE_WINDOWS.Taper;
}

function sortWorkoutPool(workouts) {
  return [...workouts].sort((left, right) => (
    (left.progressionLevel ?? 0) - (right.progressionLevel ?? 0)
    || (left.durationMinutes ?? 0) - (right.durationMinutes ?? 0)
    || String(left.workoutId).localeCompare(String(right.workoutId))
  ));
}

export function getHyroxLibraryPhaseForSchedulePhase(schedulePhase) {
  return mapSchedulePhaseToLibraryPhase(schedulePhase);
}

export function getHyroxSchedulePhaseForLibraryPhase(libraryPhase) {
  return HYROX_LIBRARY_PHASE_TO_SCHEDULE_PHASE[libraryPhase] || null;
}

export function getHyroxSessionSlotPattern({ phaseType, schedulePhase, weekType, trainingDays, weekNumber }) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  const window = getPhaseWindow(schedulePhase, weekNumber);
  const libraryPhase = resolveLibraryPhase({ phaseType, schedulePhase }) || window.libraryPhase || 'foundation';
  return HYROX_PHASE_SESSION_SLOT_PATTERNS[libraryPhase]?.[normalizedWeekType]?.[normalizedDays] || [];
}

export function getHyroxWorkoutPoolsByPhase(phaseType, schedulePhase, weekNumber) {
  const window = getPhaseWindow(schedulePhase, weekNumber);
  const libraryPhase = resolveLibraryPhase({ phaseType, schedulePhase }) || window.libraryPhase || 'foundation';
  const workouts = HYROX_WORKOUT_LIBRARY[libraryPhase] || [];
  const pools = {
    libraryPhase,
    schedulePhase: schedulePhase || window.schedulePhase || getHyroxSchedulePhaseForLibraryPhase(libraryPhase),
    hyrox_functional: sortWorkoutPool(workouts.filter(workout => workout.sessionType === 'hyrox_functional')),
    hyrox_simulation: sortWorkoutPool(workouts.filter(workout => workout.sessionType === 'hyrox_simulation')),
  };

  return pools;
}

export function selectHyroxWorkoutForSlot({
  phaseType,
  schedulePhase,
  weekType,
  trainingDays,
  weekNumber,
  slotIndex,
}) {
  const pools = getHyroxWorkoutPoolsByPhase(phaseType, schedulePhase, weekNumber);
  const slotPattern = getHyroxSessionSlotPattern({
    phaseType: pools.libraryPhase,
    schedulePhase: schedulePhase || pools.schedulePhase,
    weekType,
    trainingDays,
    weekNumber,
  });
  const sessionType = slotPattern[slotIndex] || 'hyrox_functional';
  const pool = pools[sessionType] || [];
  if (pool.length === 0) return null;

  const phaseWindow = getPhaseWindow(schedulePhase || pools.schedulePhase, weekNumber);
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  const phaseWeekIndex = Number.isFinite(weekNumber)
    ? Math.max(0, weekNumber - phaseWindow.startWeek)
    : 0;
  const rotationIndex = (phaseWeekIndex + slotIndex + (normalizedWeekType === 'B' ? 1 : 0)) % pool.length;
  const workout = pool[rotationIndex];
  const resolvedSchedulePhase = schedulePhase || phaseWindow.schedulePhase || pools.schedulePhase;

  return {
    ...workout,
    schedulePhaseType: resolvedSchedulePhase,
    libraryPhaseType: pools.libraryPhase,
    sessionType,
    trainingDays: normalizedDays,
    weekType: normalizedWeekType,
    weekNumber: Number.isFinite(weekNumber) ? weekNumber : null,
    slotIndex,
    rotationIndex,
  };
}

export function generateHyroxWeeklyWorkoutSelection({
  phaseType,
  schedulePhase,
  weekNumber,
  weekType,
  trainingDays,
}) {
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const normalizedWeekType = normalizeWeekType(weekType, weekNumber);
  const slotCount = HYROX_TRAINING_DAY_SLOT_COUNTS[normalizedDays];
  const slotPattern = getHyroxSessionSlotPattern({
    phaseType,
    schedulePhase,
    weekType: normalizedWeekType,
    trainingDays: normalizedDays,
    weekNumber,
  });

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const workout = selectHyroxWorkoutForSlot({
      phaseType,
      schedulePhase,
      weekType: normalizedWeekType,
      trainingDays: normalizedDays,
      weekNumber,
      slotIndex,
    });

    return workout ? {
      ...workout,
      slotPatternSessionType: slotPattern[slotIndex] || null,
    } : null;
  }).filter(Boolean);
}

export function generateHyroxWorkoutSchedule({
  phaseType,
  schedulePhase,
  weekNumber,
  weekType,
  trainingDays,
}) {
  const selections = generateHyroxWeeklyWorkoutSelection({
    phaseType,
    schedulePhase,
    weekNumber,
    weekType,
    trainingDays,
  });

  return selections.map((workout, index) => ({
    ...workout,
    slotIndex: index,
  }));
}

export {
  HYROX_PHASE_SESSION_SLOT_PATTERNS,
  HYROX_SCHEDULE_PHASE_WINDOWS,
  HYROX_TRAINING_DAY_SLOT_COUNTS,
};
