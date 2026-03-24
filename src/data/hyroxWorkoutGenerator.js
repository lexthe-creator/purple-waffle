import {
  HYROX_MOVEMENT_SPECIFICITY_TYPES,
  HYROX_SUBSTITUTIONS,
  HYROX_WORKOUT_LIBRARY,
} from './hyroxWorkoutLibrary.js';
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
  taper: {
    A: {
      '4-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_functional', 'hyrox_simulation'],
    },
    B: {
      '4-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional'],
      '5-day': ['hyrox_functional', 'hyrox_functional', 'hyrox_simulation', 'hyrox_functional', 'hyrox_simulation'],
    },
  },
};

const HYROX_ANTI_REPEAT_LOOKBACK_WEEKS = 2;
const HYROX_EQUIPMENT_TYPE_LIST = Object.freeze([
  'machine',
  'dumbbell',
  'barbell',
  'dumbbells',
  'kettlebells',
  'cable_machine',
  'smith_machine',
  'leg_press',
  'hack_squat_machine',
  'hip_thrust_machine',
  'plate_loaded_machines',
  'selectorized_machines',
  'adjustable_bench',
  'sled_push',
  'sled_pull',
  'wall_ball',
  'sandbag',
  'farmer_carry_handles',
  'battle_ropes',
  'plyo_box',
  'treadmill',
  'outdoor_running',
  'bike',
  'rower',
  'ski_erg',
  'bodyweight',
]);
const HYROX_EQUIPMENT_MODE_DEFAULTS = {
  full_gym: Object.fromEntries(HYROX_EQUIPMENT_TYPE_LIST.map(type => [type, true])),
  limited_gym: {
    bodyweight: true,
    dumbbells: true,
    kettlebells: true,
    cable_machine: true,
    adjustable_bench: true,
    treadmill: true,
    outdoor_running: true,
    bike: true,
    rower: true,
  },
  bodyweight: {
    bodyweight: true,
    outdoor_running: true,
  },
};
const HYROX_PROFILE_TO_MODE = {
  full_gym: 'full_gym',
  limited_gym: 'limited_gym',
  bodyweight: 'bodyweight',
};
const HYROX_EQUIPMENT_ALIASES = {
  dumbbell: 'dumbbells',
  machine: 'selectorized_machines',
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

function resolveEquipmentContext(options = {}) {
  const legacyProfile = options.equipmentProfile && HYROX_PROFILE_TO_MODE[options.equipmentProfile]
    ? options.equipmentProfile
    : null;
  const requestedMode = options.equipmentMode && HYROX_PROFILE_TO_MODE[options.equipmentMode]
    ? options.equipmentMode
    : null;
  const equipmentMode = requestedMode || legacyProfile || 'full_gym';
  const defaults = { ...(HYROX_EQUIPMENT_MODE_DEFAULTS[equipmentMode] || HYROX_EQUIPMENT_MODE_DEFAULTS.full_gym) };
  const explicitAvailability = options.equipmentAvailability || {};
  const availability = { ...defaults };
  for (const [key, enabled] of Object.entries(explicitAvailability)) {
    const normalizedKey = HYROX_EQUIPMENT_ALIASES[key] || key;
    availability[normalizedKey] = Boolean(enabled);
  }

  return {
    equipmentMode,
    availability,
    preferredEquipmentTags: [...(options.preferredEquipmentTags || [])],
    preferredRunMode: options.preferredRunMode || 'either',
    preferredEngineModes: [...(options.preferredEngineModes || ['any'])],
  };
}

function resolveSubstitutionsForMovement(movementId, equipmentProfile) {
  return HYROX_SUBSTITUTIONS[equipmentProfile]?.[movementId]
    || HYROX_SUBSTITUTIONS.full_gym?.[movementId]
    || null;
}

function isOptionAllowedForPhase(option, libraryPhase) {
  const specificityType = option?.specificityType || 'analogous';
  if (!HYROX_MOVEMENT_SPECIFICITY_TYPES.includes(specificityType)) return true;
  if (libraryPhase === 'foundation' || libraryPhase === 'base') return true;
  if (libraryPhase === 'build') return specificityType !== 'fallback';
  if (libraryPhase === 'peak') return specificityType === 'exact' || specificityType === 'analogous';
  return true;
}

function resolveOptionPreferenceScore(option, equipmentContext) {
  let score = 0;
  const optionTags = new Set(option.tags || []);
  for (const preferredTag of equipmentContext.preferredEquipmentTags) {
    if (optionTags.has(preferredTag)) score += 4;
  }
  if (option.movementId === 'Outdoor Run' || option.movementId === 'Treadmill Run') {
    if (equipmentContext.preferredRunMode === 'outdoor' && option.equipmentType === 'outdoor_running') score += 8;
    if (equipmentContext.preferredRunMode === 'treadmill' && option.equipmentType === 'treadmill') score += 8;
  }
  const preferredEngineModes = equipmentContext.preferredEngineModes || ['any'];
  if (!preferredEngineModes.includes('any') && preferredEngineModes.includes(option.equipmentType)) {
    score += 6;
  }
  if (option.specificityType === 'exact') score += 3;
  if (option.specificityType === 'fallback') score -= 2;
  return score;
}

function resolveBlockMovement({
  block,
  weekNumber,
  slotIndex,
  equipmentContext,
  libraryPhase,
  recentMovementIds = new Set(),
}) {
  if (!Array.isArray(block?.movementOptions) || block.movementOptions.length === 0) {
    return { ...block };
  }
  const { movementOptions, ...blockWithoutOptions } = block;

  const availableEquipment = equipmentContext.availability || HYROX_EQUIPMENT_MODE_DEFAULTS.full_gym;
  const optionsById = new Map(block.movementOptions.map(option => [option.movementId, option]));
  const optionsMatchingEquipment = block.movementOptions.filter((option) => {
    const normalizedEquipment = HYROX_EQUIPMENT_ALIASES[option.equipmentType] || option.equipmentType;
    return normalizedEquipment === 'bodyweight' || availableEquipment[normalizedEquipment];
  });
  const equipmentFiltered = optionsMatchingEquipment.length > 0 ? optionsMatchingEquipment : block.movementOptions;
  const phaseFiltered = equipmentFiltered.filter(option => isOptionAllowedForPhase(option, libraryPhase));
  const specificityPool = phaseFiltered.length > 0 ? phaseFiltered : equipmentFiltered;
  const preferenceSorted = [...specificityPool].sort((left, right) => (
    resolveOptionPreferenceScore(right, equipmentContext) - resolveOptionPreferenceScore(left, equipmentContext)
    || String(left.movementId).localeCompare(String(right.movementId))
  ));
  const antiRepeatPool = preferenceSorted.filter(option => !recentMovementIds.has(option.movementId));
  const selectionPool = antiRepeatPool.length > 0
    ? antiRepeatPool
    : preferenceSorted;
  const startIndex = Math.max(0, (Number.isFinite(weekNumber) ? weekNumber : 1) - 1);
  const rotationIndex = (startIndex + slotIndex) % selectionPool.length;
  const rotatedOption = selectionPool[rotationIndex] || null;
  const defaultOption = optionsById.get(block.defaultMovementId) || null;
  const selectedOption = rotatedOption || defaultOption || block.movementOptions[0];
  const substitution = selectedOption ? resolveSubstitutionsForMovement(selectedOption.movementId, equipmentContext.equipmentMode) : null;

  return {
    ...blockWithoutOptions,
    selectedMovementId: selectedOption?.movementId || block.defaultMovementId || null,
    selectedMovement: selectedOption ? {
      movementId: selectedOption.movementId,
      displayName: selectedOption.displayName,
      equipmentType: selectedOption.equipmentType,
      tags: [...(selectedOption.tags || [])],
    } : null,
    preferredAlternatives: [...(substitution?.preferredAlternatives || [])],
    requiredFallbacks: [...(substitution?.requiredFallbacks || [])],
  };
}

function resolveWorkoutMovementOptions({ workout, weekNumber, slotIndex, equipmentContext, libraryPhase, recentMovementIds }) {
  const localRecentMovementIds = new Set(recentMovementIds || []);
  return {
    ...workout,
    structure: (workout.structure || []).map((block, blockIndex) => {
      const resolved = resolveBlockMovement({
        block,
        weekNumber,
        slotIndex: slotIndex + blockIndex,
        equipmentContext,
        libraryPhase,
        recentMovementIds: localRecentMovementIds,
      });
      if (resolved.selectedMovementId) {
        localRecentMovementIds.add(resolved.selectedMovementId);
      }
      return resolved;
    }),
  };
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
  const patternPhase = (schedulePhase || window.schedulePhase) === 'Taper' ? 'taper' : libraryPhase;
  return HYROX_PHASE_SESSION_SLOT_PATTERNS[patternPhase]?.[normalizedWeekType]?.[normalizedDays]
    || HYROX_PHASE_SESSION_SLOT_PATTERNS[libraryPhase]?.[normalizedWeekType]?.[normalizedDays]
    || [];
}

export function getHyroxWorkoutPoolsByPhase(phaseType, schedulePhase, weekNumber) {
  const window = getPhaseWindow(schedulePhase, weekNumber);
  const resolvedSchedulePhase = schedulePhase || window.schedulePhase || null;
  const libraryPhase = resolveLibraryPhase({ phaseType, schedulePhase: resolvedSchedulePhase }) || window.libraryPhase || 'foundation';
  const workouts = resolvedSchedulePhase === 'Taper'
    ? [...(HYROX_WORKOUT_LIBRARY.base || []), ...(HYROX_WORKOUT_LIBRARY.peak || [])]
    : (HYROX_WORKOUT_LIBRARY[libraryPhase] || []);
  const pools = {
    libraryPhase,
    schedulePhase: resolvedSchedulePhase || getHyroxSchedulePhaseForLibraryPhase(libraryPhase),
    hyrox_functional: sortWorkoutPool(workouts.filter(workout => workout.sessionType === 'hyrox_functional')),
    hyrox_simulation: sortWorkoutPool(workouts.filter(workout => workout.sessionType === 'hyrox_simulation')),
  };

  return pools;
}

function resolveWorkoutPoolCap({ schedulePhase, pool, minUniqueNeeded = 1 }) {
  if (schedulePhase !== 'Taper') return pool.length;
  const taperCap = Math.max(minUniqueNeeded, Math.ceil(pool.length * 0.45));
  return Math.min(pool.length, Math.max(1, taperCap));
}

function getRecentWorkoutIds({
  phaseType,
  schedulePhase,
  weekType,
  trainingDays,
  weekNumber,
  lookbackWeeks = HYROX_ANTI_REPEAT_LOOKBACK_WEEKS,
}) {
  if (!Number.isFinite(weekNumber) || weekNumber <= 1 || lookbackWeeks <= 0) {
    return new Set();
  }

  const recentIds = new Set();
  const normalizedDays = normalizeTrainingDays(trainingDays);
  const slotCount = HYROX_TRAINING_DAY_SLOT_COUNTS[normalizedDays];

  for (let offset = 1; offset <= lookbackWeeks; offset += 1) {
    const priorWeekNumber = weekNumber - offset;
    if (priorWeekNumber < 1) break;

    const effectivePriorSchedulePhase = schedulePhase && schedulePhase !== 'Taper'
      ? schedulePhase
      : getPhaseWindow(null, priorWeekNumber).schedulePhase;
    const priorWeekType = normalizeWeekType(weekType, priorWeekNumber);
    const priorPools = getHyroxWorkoutPoolsByPhase(phaseType, effectivePriorSchedulePhase, priorWeekNumber);
    const priorSlotPattern = getHyroxSessionSlotPattern({
      phaseType: priorPools.libraryPhase,
      schedulePhase: effectivePriorSchedulePhase || priorPools.schedulePhase,
      weekType: priorWeekType,
      trainingDays: normalizedDays,
      weekNumber: priorWeekNumber,
    });
    const priorWindow = getPhaseWindow(effectivePriorSchedulePhase || priorPools.schedulePhase, priorWeekNumber);

    for (let priorSlotIndex = 0; priorSlotIndex < slotCount; priorSlotIndex += 1) {
      const priorSessionType = priorSlotPattern[priorSlotIndex] || 'hyrox_functional';
      const priorPool = priorPools[priorSessionType] || [];
      if (priorPool.length === 0) continue;

      const priorPoolCap = resolveWorkoutPoolCap({
        schedulePhase: effectivePriorSchedulePhase || priorWindow.schedulePhase || priorPools.schedulePhase,
        pool: priorPool,
        minUniqueNeeded: 1,
      });
      const priorPhaseWeekIndex = Math.max(0, priorWeekNumber - priorWindow.startWeek);
      const priorSchedulePhase = effectivePriorSchedulePhase || priorWindow.schedulePhase || priorPools.schedulePhase;
      const priorPhaseSeed = priorSchedulePhase === 'Taper'
        ? 0
        : priorPhaseWeekIndex * 2;
      const priorSlotSeed = priorSlotIndex * 2;
      const priorWeekTypeSeed = priorWeekType === 'B' ? 1 : 0;
      const priorRotationIndex = (priorPhaseSeed + priorSlotSeed + priorWeekTypeSeed) % priorPoolCap;
      const priorWorkout = priorPool[priorRotationIndex];
      if (priorWorkout?.workoutId) {
        recentIds.add(priorWorkout.workoutId);
      }
    }
  }

  return recentIds;
}

export function selectHyroxWorkoutForSlot({
  phaseType,
  schedulePhase,
  weekType,
  trainingDays,
  weekNumber,
  slotIndex,
  equipmentProfile = 'full_gym',
  equipmentMode,
  equipmentAvailability,
  preferredEquipmentTags,
  preferredRunMode,
  preferredEngineModes,
  excludedWorkoutIds = null,
  recentMovementIds = new Set(),
}) {
  const equipmentContext = resolveEquipmentContext({
    equipmentProfile,
    equipmentMode,
    equipmentAvailability,
    preferredEquipmentTags,
    preferredRunMode,
    preferredEngineModes,
  });
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
  const requiredUniqueInWeek = slotPattern.filter(type => (type || 'hyrox_functional') === sessionType).length || 1;
  const resolvedSchedulePhase = schedulePhase || phaseWindow.schedulePhase || pools.schedulePhase;
  const poolCap = resolveWorkoutPoolCap({
    schedulePhase: resolvedSchedulePhase,
    pool,
    minUniqueNeeded: requiredUniqueInWeek,
  });
  const phaseSeed = resolvedSchedulePhase === 'Taper'
    ? 0
    : phaseWeekIndex * 2;
  const slotSeed = slotIndex * 2;
  const weekTypeSeed = normalizedWeekType === 'B' ? 1 : 0;
  const baseRotationIndex = (phaseSeed + slotSeed + weekTypeSeed) % poolCap;
  const recentIds = getRecentWorkoutIds({
    phaseType,
    schedulePhase: resolvedSchedulePhase,
    weekType: normalizedWeekType,
    trainingDays: normalizedDays,
    weekNumber,
  });
  const candidateIndexes = Array.from({ length: poolCap }, (_, idx) => (baseRotationIndex + idx) % poolCap);
  const chosenIndex = candidateIndexes.find((index) => {
    const workoutId = pool[index]?.workoutId;
    if (!workoutId) return false;
    if (recentIds.has(workoutId)) return false;
    if (excludedWorkoutIds?.has(workoutId)) return false;
    return true;
  })
    ?? candidateIndexes.find((index) => {
      const workoutId = pool[index]?.workoutId;
      return Boolean(workoutId) && !excludedWorkoutIds?.has(workoutId);
    })
    ?? baseRotationIndex;
  const workout = resolveWorkoutMovementOptions({
    workout: pool[chosenIndex],
    weekNumber,
    slotIndex,
    equipmentContext,
    libraryPhase: pools.libraryPhase,
    recentMovementIds,
  });

  return {
    ...workout,
    schedulePhaseType: resolvedSchedulePhase,
    libraryPhaseType: pools.libraryPhase,
    sessionType,
    trainingDays: normalizedDays,
    weekType: normalizedWeekType,
    weekNumber: Number.isFinite(weekNumber) ? weekNumber : null,
    slotIndex,
    rotationIndex: chosenIndex,
  };
}

export function generateHyroxWeeklyWorkoutSelection({
  phaseType,
  schedulePhase,
  weekNumber,
  weekType,
  trainingDays,
  equipmentProfile = 'full_gym',
  equipmentMode,
  equipmentAvailability,
  preferredEquipmentTags,
  preferredRunMode,
  preferredEngineModes,
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
  const weekUsedWorkoutIds = new Set();
  const recentMovementIds = new Set();

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const workout = selectHyroxWorkoutForSlot({
      phaseType,
      schedulePhase,
      weekType: normalizedWeekType,
      trainingDays: normalizedDays,
      weekNumber,
      slotIndex,
      equipmentProfile,
      equipmentMode,
      equipmentAvailability,
      preferredEquipmentTags,
      preferredRunMode,
      preferredEngineModes,
      excludedWorkoutIds: weekUsedWorkoutIds,
      recentMovementIds,
    });
    if (workout?.workoutId) {
      weekUsedWorkoutIds.add(workout.workoutId);
    }
    for (const block of (workout?.structure || [])) {
      if (block?.selectedMovementId) recentMovementIds.add(block.selectedMovementId);
    }

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
  equipmentProfile = 'full_gym',
  equipmentMode,
  equipmentAvailability,
  preferredEquipmentTags,
  preferredRunMode,
  preferredEngineModes,
}) {
  const selections = generateHyroxWeeklyWorkoutSelection({
    phaseType,
    schedulePhase,
    weekNumber,
    weekType,
    trainingDays,
    equipmentProfile,
    equipmentMode,
    equipmentAvailability,
    preferredEquipmentTags,
    preferredRunMode,
    preferredEngineModes,
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
