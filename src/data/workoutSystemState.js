import {
  hyroxEquipmentModes,
  hyroxEquipmentTypes,
  hyroxPreferredEngineModes,
  hyroxPreferredRunModes,
  programProfiles,
  supportedProgramTypes,
  workoutStatuses,
} from './workoutSystemSchema.js';
import { normalizeProgramType } from './programRouter.js';

const STORAGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_FITNESS_SETTINGS = Object.freeze({
  programType: 'hyrox',
  programStartDate: new Date().toISOString().slice(0, 10),
  trainingDays: '4-day',
  raceDate: null,
  raceName: '',
  raceCategory: '',
  fitnessLevel: '',
  equipmentAccess: 'full-gym',
  equipmentMode: 'full_gym',
  equipmentAvailability: {},
  preferredEquipmentTags: [],
  preferredRunMode: 'either',
  preferredEngineModes: ['any'],
  goalFinishTime: '',
  currentWeeklyMileage: null,
  injuriesOrLimitations: '',
});

export const DEFAULT_ATHLETE_PROFILE = Object.freeze({
  fiveKTime: null,
  hyroxFinishTime: null,
  strongStations: [],
  weakStations: [],
  squat5RM: null,
  deadlift5RM: null,
  fitnessLevel: 'intermediate',
  equipment: [],
  bodyWeight: null,
  bodyWeightUnit: 'kg',
  age: null,
  biologicalSex: '',
  sweatRate: null,
});

export const DEFAULT_APP_STATE = Object.freeze({
  planningMode: true,
  energyState: {
    value: 5,
    sleepHours: 7,
    sleepSource: 'baseline',
    lastCheckIn: null,
  },
  fitnessSettings: DEFAULT_FITNESS_SETTINGS,
  workCalendarPrefs: {
    planningOrder: 'priority',
    busyBlockBehavior: 'hard',
    googleSyncStatus: 'disconnected',
  },
  mealPrefs: {
    hydrationGoal: 8,
    dietaryNotes: '',
  },
  notificationPrefs: {
    morningReminder: true,
    workoutReminder: true,
  },
  calendarPatterns: [],
  recoveryInputs: {
    preferredSession: 'fullbody',
    lastRecoveryFocus: '',
  },
  hubInsights: {
    favoriteSections: [],
    weeklyNotes: [],
  },
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDateKey(value) {
  return typeof value === 'string' && STORAGE_DATE_RE.test(value);
}

function normalizeDateKey(value, fallback = null) {
  return isDateKey(value) ? value : fallback;
}

function normalizeStringArray(value, fallback = []) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [...fallback];
}

function normalizeText(value, fallback = null) {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return fallback;
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.trim().length > 0).map(item => item.trim())
    : [];
}

function normalizeNumericField(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function inferWorkoutBlockType(name, index, totalCount) {
  const label = String(name || '').toLowerCase();
  if (label.includes('warm')) return 'warmup';
  if (label.includes('cool')) return 'cooldown';
  if (label.includes('recover')) return 'recovery';
  if (label.includes('interval')) return 'intervals';
  if (label.includes('tempo')) return 'timed-effort';
  if (index === 0 && totalCount > 1) return 'warmup';
  if (index === totalCount - 1 && totalCount > 1) return 'cooldown';
  return 'main';
}

export function normalizeWorkoutExercise(raw, index = 0) {
  const src = isPlainObject(raw) ? raw : {};
  const name = normalizeText(src.name || src.n, `Exercise ${index + 1}`);
  const detail = normalizeText(src.detail || src.details || src.description);

  return {
    id: normalizeText(src.id, `exercise-${index}`),
    name,
    detail,
    sets: normalizeNumericField(src.sets, src.s),
    reps: normalizeText(src.reps || src.r),
    interval: normalizeText(src.interval),
    timedEffort: normalizeText(src.timedEffort || src.time || src.duration),
    duration: normalizeText(src.duration),
    rest: normalizeText(src.rest),
    distance: normalizeText(src.distance),
    effort: normalizeText(src.effort),
    note: normalizeText(src.note),
    cue: normalizeText(src.cue),
    completed: src.completed === true,
  };
}

function normalizeWorkoutBlock(raw, index = 0) {
  const src = isPlainObject(raw) ? raw : {};
  const exercises = Array.isArray(src.exercises)
    ? src.exercises.map((exercise, exerciseIndex) => normalizeWorkoutExercise(exercise, exerciseIndex))
    : [];
  const title = normalizeText(src.title || src.name, `Block ${index + 1}`);
  const blockNotes = normalizeStringList(src.notes);
  const detail = normalizeText(src.detail || src.details);

  if (detail && blockNotes.length === 0) {
    blockNotes.push(detail);
  }

  return {
    id: normalizeText(src.id || src.blockId, `block-${index}`),
    title,
    type: normalizeText(src.type || src.blockType, inferWorkoutBlockType(title, index, exercises.length)),
    format: normalizeText(src.format),
    duration: normalizeText(src.duration)
      || (Number.isFinite(src.durationMinutes) ? `${src.durationMinutes} min` : null),
    repeat: normalizeNumericField(src.repeat, src.rounds),
    notes: blockNotes,
    exercises,
  };
}

export function buildWorkoutContentFromExercises(exercises, options = {}) {
  const normalizedExercises = Array.isArray(exercises)
    ? exercises.map((exercise, index) => normalizeWorkoutExercise(exercise, index))
    : [];

  return {
    version: 1,
    source: options.source || 'manual',
    blocks: normalizedExercises.map((exercise, index) => ({
      id: `block-${exercise.id || index}`,
      title: exercise.name || `Block ${index + 1}`,
      type: inferWorkoutBlockType(exercise.name, index, normalizedExercises.length),
      format: null,
      duration: exercise.timedEffort || exercise.duration || null,
      repeat: exercise.sets,
      notes: [exercise.detail, exercise.note, exercise.cue].filter(Boolean),
      exercises: [exercise],
    })),
    notes: normalizeStringList(options.notes),
  };
}

export function buildWorkoutContentFromSession(session) {
  const src = isPlainObject(session) ? session : {};
  const sourceNotes = [
    normalizeText(src.objective),
    normalizeText(src.shortVersionRule),
    normalizeText(src.detail),
  ].filter(Boolean);

  if (Array.isArray(src.content?.blocks) && src.content.blocks.length > 0) {
    return {
      version: Number.isFinite(src.content.version) ? src.content.version : 1,
      source: normalizeText(src.content.source, 'program'),
      blocks: src.content.blocks.map((block, index) => normalizeWorkoutBlock(block, index)),
      notes: normalizeStringList(src.content.notes).length > 0 ? normalizeStringList(src.content.notes) : sourceNotes,
    };
  }

  if (Array.isArray(src.structure) && src.structure.length > 0) {
    return {
      version: 1,
      source: 'program',
      blocks: src.structure.map((block, index) => {
        const blockTitle = normalizeText(block?.name, `Block ${index + 1}`);
        const detail = normalizeText(block?.details);
        const selectedMovementName = normalizeText(block?.selectedMovement?.displayName);
        const exerciseName = selectedMovementName || blockTitle;
        const blockNotes = [
          detail,
          Array.isArray(block?.stationsUsed) && block.stationsUsed.length > 0
            ? `Stations: ${block.stationsUsed.join(', ')}`
            : null,
        ].filter(Boolean);

        return normalizeWorkoutBlock({
          id: block?.blockId || `block-${index}`,
          title: blockTitle,
          type: inferWorkoutBlockType(blockTitle, index, src.structure.length),
          duration: Number.isFinite(block?.durationMinutes) ? `${block.durationMinutes} min` : null,
          notes: blockNotes,
          exercises: [
            {
              id: block?.blockId || `exercise-${index}`,
              name: exerciseName,
              detail,
              sets: block?.rounds,
              interval: src?.sessionType?.includes('interval') ? detail : null,
              timedEffort: Number.isFinite(block?.durationMinutes) ? `${block.durationMinutes} min` : null,
              effort: normalizeText(src?.intensity),
              note: blockNotes[1] || null,
              cue: selectedMovementName && selectedMovementName !== blockTitle ? `Selected movement: ${selectedMovementName}` : null,
            },
          ],
        }, index);
      }),
      notes: sourceNotes,
    };
  }

  return buildWorkoutContentFromExercises(src.exercises || src.ex, {
    source: src.programType || src.programId ? 'program' : 'manual',
    notes: sourceNotes,
  });
}

function normalizeWorkoutContent(raw, fallback = {}) {
  const src = isPlainObject(raw) ? raw : null;

  if (src) {
    return {
      version: Number.isFinite(src.version) ? src.version : 1,
      source: normalizeText(src.source, fallback.source || 'manual'),
      blocks: Array.isArray(src.blocks)
        ? src.blocks.map((block, index) => normalizeWorkoutBlock(block, index))
        : [],
      notes: normalizeStringList(src.notes),
    };
  }

  return buildWorkoutContentFromExercises(fallback.exercises, {
    source: fallback.source || 'manual',
    notes: fallback.notes,
  });
}

function normalizeWorkoutSource(raw, fallback = {}) {
  const src = isPlainObject(raw) ? raw : {};

  return {
    origin: normalizeText(src.origin, fallback.origin || 'manual'),
    importKey: normalizeText(src.importKey || src.sessionKey || fallback.importKey),
    templateId: normalizeText(src.templateId || src.warmupTemplateId || fallback.templateId),
    libraryId: normalizeText(src.libraryId || src.workoutId || fallback.libraryId),
    sessionType: normalizeText(src.sessionType || fallback.sessionType),
  };
}

function normalizeEquipmentMode(value, equipmentAccess = 'full-gym') {
  if (hyroxEquipmentModes.includes(value)) return value;
  if (value === 'limited' || equipmentAccess === 'limited') return 'limited_gym';
  if (value === 'bodyweight-only' || equipmentAccess === 'bodyweight-only') return 'bodyweight';
  return 'full_gym';
}

function normalizeEquipmentAccess(value, equipmentMode = 'full_gym') {
  if (value === 'full-gym' || value === 'limited' || value === 'bodyweight-only') return value;
  if (equipmentMode === 'limited_gym') return 'limited';
  if (equipmentMode === 'bodyweight') return 'bodyweight-only';
  return 'full-gym';
}

function buildEquipmentAvailability(equipmentMode, overrides = {}) {
  const defaultAvailability = Object.fromEntries(hyroxEquipmentTypes.map(type => [type, false]));

  if (equipmentMode === 'full_gym') {
    for (const type of hyroxEquipmentTypes) {
      defaultAvailability[type] = true;
    }
  } else if (equipmentMode === 'limited_gym') {
    Object.assign(defaultAvailability, {
      bodyweight: true,
      dumbbells: true,
      kettlebells: true,
      cable_machine: true,
      adjustable_bench: true,
      selectorized_machines: true,
      plate_loaded_machines: true,
      leg_press: true,
      hack_squat_machine: true,
      hip_thrust_machine: true,
      treadmill: true,
      outdoor_running: true,
      bike: true,
      rower: true,
      ski_erg: true,
      farmer_carry_handles: true,
      sandbag: true,
      wall_ball: true,
      sled_push: true,
      sled_pull: true,
      plyo_box: true,
    });
  } else {
    Object.assign(defaultAvailability, {
      bodyweight: true,
      outdoor_running: true,
    });
  }

  for (const [key, enabled] of Object.entries(overrides || {})) {
    if (key in defaultAvailability) {
      defaultAvailability[key] = Boolean(enabled);
    }
  }

  return defaultAvailability;
}

function normalizeTrainingDays(value, programType) {
  const supportedDays = programProfiles[programType]?.supportedDaysPerWeek || [4, 5];
  const numericValue = value === '3-day' ? 3 : value === '4-day' ? 4 : value === '5-day' ? 5 : value;
  if (supportedDays.includes(numericValue)) return `${numericValue}-day`;
  return supportedDays.includes(4) ? '4-day' : `${supportedDays[0] || 4}-day`;
}

function normalizeWorkoutStatus(status) {
  if (workoutStatuses.includes(status)) return status;
  if (status === 'active') return 'planned';
  if (status === 'done') return 'completed';
  return 'planned';
}

function getProgramDisplayName(programType) {
  const normalized = normalizeProgramType(programType);
  if (normalized === '5k') return '5K run builder';
  if (normalized === 'strength_block') return 'Strength Block plan';
  return 'HYROX 32-week plan';
}

export function normalizeFitnessSettings(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const programType = normalizeProgramType(src.programType);
  const equipmentMode = normalizeEquipmentMode(src.equipmentMode, src.equipmentAccess);
  const preferredEngineModes = normalizeStringArray(src.preferredEngineModes, ['any'])
    .filter(mode => hyroxPreferredEngineModes.includes(mode))
    .slice(0, 3);

  return {
    ...DEFAULT_FITNESS_SETTINGS,
    ...src,
    programType,
    programStartDate: isDateKey(src.programStartDate) ? src.programStartDate : DEFAULT_FITNESS_SETTINGS.programStartDate,
    trainingDays: normalizeTrainingDays(src.trainingDays || src.selectedFrequency, programType),
    raceDate: isDateKey(src.raceDate) ? src.raceDate : null,
    raceName: typeof src.raceName === 'string' ? src.raceName : '',
    raceCategory: typeof src.raceCategory === 'string' ? src.raceCategory : '',
    fitnessLevel: typeof src.fitnessLevel === 'string' ? src.fitnessLevel : '',
    equipmentAccess: normalizeEquipmentAccess(src.equipmentAccess, equipmentMode),
    equipmentMode,
    equipmentAvailability: buildEquipmentAvailability(equipmentMode, isPlainObject(src.equipmentAvailability) ? src.equipmentAvailability : {}),
    preferredEquipmentTags: normalizeStringArray(src.preferredEquipmentTags),
    preferredRunMode: hyroxPreferredRunModes.includes(src.preferredRunMode) ? src.preferredRunMode : 'either',
    preferredEngineModes: preferredEngineModes.length > 0 ? preferredEngineModes : ['any'],
    goalFinishTime: typeof src.goalFinishTime === 'string' ? src.goalFinishTime : '',
    currentWeeklyMileage: Number.isFinite(src.currentWeeklyMileage) ? src.currentWeeklyMileage : null,
    injuriesOrLimitations: typeof src.injuriesOrLimitations === 'string' ? src.injuriesOrLimitations : '',
  };
}

export function normalizeAthleteProfile(raw) {
  const src = isPlainObject(raw) ? raw : {};

  return {
    ...DEFAULT_ATHLETE_PROFILE,
    ...src,
    fiveKTime: typeof src.fiveKTime === 'string' ? src.fiveKTime : null,
    hyroxFinishTime: typeof src.hyroxFinishTime === 'string' ? src.hyroxFinishTime : null,
    strongStations: normalizeStringArray(src.strongStations),
    weakStations: normalizeStringArray(src.weakStations),
    squat5RM: Number.isFinite(src.squat5RM) ? src.squat5RM : null,
    deadlift5RM: Number.isFinite(src.deadlift5RM) ? src.deadlift5RM : null,
    fitnessLevel: typeof src.fitnessLevel === 'string' ? src.fitnessLevel : DEFAULT_ATHLETE_PROFILE.fitnessLevel,
    equipment: normalizeStringArray(src.equipment),
    bodyWeight: Number.isFinite(src.bodyWeight) ? src.bodyWeight : null,
    bodyWeightUnit: src.bodyWeightUnit === 'lbs' ? 'lbs' : 'kg',
    age: Number.isFinite(src.age) ? src.age : null,
    biologicalSex: ['male', 'female', 'other'].includes(src.biologicalSex) ? src.biologicalSex : '',
    sweatRate: Number.isFinite(src.sweatRate) ? src.sweatRate : null,
  };
}

export function normalizeWorkoutRecord(raw, index = 0) {
  const src = isPlainObject(raw) ? raw : {};
  const scheduledDate = normalizeDateKey(src.scheduledDate);
  const plannedDate = normalizeDateKey(src.plannedDate, scheduledDate);
  const programType = normalizeProgramType(src.programType || src.programId);
  const exercises = Array.isArray(src.exercises)
    ? src.exercises.map((exercise, exerciseIndex) => normalizeWorkoutExercise(exercise, exerciseIndex))
    : Array.isArray(src.ex)
      ? src.ex.map((exercise, exerciseIndex) => normalizeWorkoutExercise(exercise, exerciseIndex))
      : [];
  const duration = Number.isFinite(src.duration)
    ? src.duration
    : Number.isFinite(src.plannedDurationMinutes)
      ? src.plannedDurationMinutes
      : 30;
  const date = normalizeDateKey(src.date, plannedDate || scheduledDate);
  const programWeek = Number.isFinite(src.programWeek) ? src.programWeek : (Number.isFinite(src.week) ? src.week : 1);
  const plannedTime = normalizeText(src.plannedTime || src.time);

  return {
    id: typeof src.id === 'string' && src.id.length > 0 ? src.id : `workout-${index}-${Date.now()}`,
    name: typeof src.name === 'string' && src.name.length > 0 ? src.name : 'Focus Session',
    programId: programType,
    programType,
    programName: typeof src.programName === 'string' && src.programName.length > 0 ? src.programName : getProgramDisplayName(programType),
    type: typeof src.type === 'string' && src.type.length > 0
      ? src.type
      : (programType === '5k' ? 'run' : programType === 'strength_block' ? 'strength' : 'hyrox'),
    status: normalizeWorkoutStatus(src.status),
    scheduledDate,
    plannedDate,
    date,
    sessionOffset: Number.isFinite(src.sessionOffset) ? src.sessionOffset : null,
    duration,
    plannedDurationMinutes: duration,
    plannedTime,
    distanceMiles: Number.isFinite(src.distanceMiles) ? src.distanceMiles : 0,
    phase: typeof src.phase === 'string' && src.phase.length > 0 ? src.phase : 'Base',
    week: programWeek,
    programWeek,
    frequency: src.frequency === '5-day' ? '5-day' : '4-day',
    anchorDay: ['Sunday', 'Monday', 'Wednesday'].includes(src.anchorDay) ? src.anchorDay : 'Monday',
    exercises,
    content: normalizeWorkoutContent(src.content, {
      exercises,
      source: src.programType || src.programId ? 'program' : 'manual',
      notes: [src.objective, src.detail, src.shortVersionRule].filter(Boolean),
    }),
    source: normalizeWorkoutSource(src.source, {
      origin: src.programType || src.programId ? 'program' : 'manual',
      importKey: src.workoutKey || src.id,
      templateId: src.warmupTemplateId || src.cooldownTemplateId,
      libraryId: src.workoutId || src.id,
      sessionType: src.sessionType || src.sessionTypeCanonical,
    }),
    title: typeof src.title === 'string' && src.title.length > 0 ? src.title : null,
    label: typeof src.label === 'string' && src.label.length > 0 ? src.label : null,
    detail: typeof src.detail === 'string' && src.detail.length > 0 ? src.detail : null,
    objective: typeof src.objective === 'string' && src.objective.length > 0 ? src.objective : null,
    sessionType: typeof src.sessionType === 'string' && src.sessionType.length > 0 ? src.sessionType : null,
    sessionTypeCanonical: typeof src.sessionTypeCanonical === 'string' && src.sessionTypeCanonical.length > 0 ? src.sessionTypeCanonical : null,
    warmupTemplateId: typeof src.warmupTemplateId === 'string' && src.warmupTemplateId.length > 0 ? src.warmupTemplateId : null,
    cooldownTemplateId: typeof src.cooldownTemplateId === 'string' && src.cooldownTemplateId.length > 0 ? src.cooldownTemplateId : null,
    shortVersionRule: typeof src.shortVersionRule === 'string' && src.shortVersionRule.length > 0 ? src.shortVersionRule : null,
    prescription: typeof src.prescription === 'string' && src.prescription.length > 0 ? src.prescription : null,
    coachingNote: typeof src.coachingNote === 'string' && src.coachingNote.length > 0 ? src.coachingNote : null,
    summaryLine1: typeof src.summaryLine1 === 'string' && src.summaryLine1.length > 0 ? src.summaryLine1 : null,
    summaryLine2: typeof src.summaryLine2 === 'string' && src.summaryLine2.length > 0 ? src.summaryLine2 : null,
    warmupSteps: Array.isArray(src.warmupSteps) ? src.warmupSteps : [],
    cooldownSteps: Array.isArray(src.cooldownSteps) ? src.cooldownSteps : [],
    workoutLog: isPlainObject(src.workoutLog) ? src.workoutLog : null,
    startedAt: Number.isFinite(src.startedAt) ? src.startedAt : null,
    completedAt: Number.isFinite(src.completedAt) ? src.completedAt : null,
    createdAt: Number.isFinite(src.createdAt) ? src.createdAt : Date.now() + index,
  };
}

export function normalizeProfile(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const athleteSource = isPlainObject(src.athlete) ? src.athlete : src;

  return {
    ...src,
    athlete: normalizeAthleteProfile(athleteSource),
    dailyLogs: isPlainObject(src.dailyLogs) ? src.dailyLogs : {},
    top3: isPlainObject(src.top3) ? src.top3 : {},
    workoutHistory: Array.isArray(src.workoutHistory)
      ? src.workoutHistory.map((item, index) => normalizeWorkoutRecord(item, index))
      : [],
    transactions: Array.isArray(src.transactions) ? src.transactions : [],
    recurringExpenses: Array.isArray(src.recurringExpenses) ? src.recurringExpenses : [],
    financialAccounts: Array.isArray(src.financialAccounts) ? src.financialAccounts : [],
    habits: Array.isArray(src.habits) ? src.habits : [],
    groceryList: Array.isArray(src.groceryList) ? src.groceryList : [],
    maintenanceHistory: isPlainObject(src.maintenanceHistory) ? src.maintenanceHistory : {},
  };
}

export function normalizeAppState(raw) {
  const src = isPlainObject(raw) ? raw : {};

  return {
    planningMode: src.planningMode ?? DEFAULT_APP_STATE.planningMode,
    energyState: {
      ...DEFAULT_APP_STATE.energyState,
      ...(isPlainObject(src.energyState) ? src.energyState : {}),
    },
    fitnessSettings: normalizeFitnessSettings(src.fitnessSettings),
    workCalendarPrefs: {
      ...DEFAULT_APP_STATE.workCalendarPrefs,
      ...(isPlainObject(src.workCalendarPrefs) ? src.workCalendarPrefs : {}),
    },
    mealPrefs: {
      ...DEFAULT_APP_STATE.mealPrefs,
      ...(isPlainObject(src.mealPrefs) ? src.mealPrefs : {}),
    },
    notificationPrefs: {
      ...DEFAULT_APP_STATE.notificationPrefs,
      ...(isPlainObject(src.notificationPrefs) ? src.notificationPrefs : {}),
    },
    calendarPatterns: Array.isArray(src.calendarPatterns) ? src.calendarPatterns : [],
    recoveryInputs: {
      ...DEFAULT_APP_STATE.recoveryInputs,
      ...(isPlainObject(src.recoveryInputs) ? src.recoveryInputs : {}),
    },
    hubInsights: {
      ...DEFAULT_APP_STATE.hubInsights,
      ...(isPlainObject(src.hubInsights) ? src.hubInsights : {}),
    },
  };
}
