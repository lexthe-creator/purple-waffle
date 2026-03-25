import {
  hyroxEquipmentModes,
  hyroxEquipmentTypes,
  hyroxPreferredEngineModes,
  hyroxPreferredRunModes,
  programProfiles,
  supportedProgramTypes,
  workoutStatuses,
} from './workoutSystemSchema.js';

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

export function normalizeFitnessSettings(raw) {
  const src = isPlainObject(raw) ? raw : {};
  const programType = supportedProgramTypes.includes(src.programType) ? src.programType : 'hyrox';
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

  return {
    id: typeof src.id === 'string' && src.id.length > 0 ? src.id : `workout-${index}-${Date.now()}`,
    name: typeof src.name === 'string' && src.name.length > 0 ? src.name : 'Focus Session',
    programId: typeof src.programId === 'string' && src.programId.length > 0 ? src.programId : 'hyrox',
    programName: typeof src.programName === 'string' && src.programName.length > 0 ? src.programName : 'HYROX 32-week plan',
    type: typeof src.type === 'string' && src.type.length > 0 ? src.type : 'hyrox',
    status: normalizeWorkoutStatus(src.status),
    scheduledDate,
    plannedDate,
    sessionOffset: Number.isFinite(src.sessionOffset) ? src.sessionOffset : null,
    duration: Number.isFinite(src.duration) ? src.duration : 30,
    distanceMiles: Number.isFinite(src.distanceMiles) ? src.distanceMiles : 0,
    phase: typeof src.phase === 'string' && src.phase.length > 0 ? src.phase : 'Base',
    week: Number.isFinite(src.week) ? src.week : 1,
    frequency: src.frequency === '5-day' ? '5-day' : '4-day',
    anchorDay: ['Sunday', 'Monday', 'Wednesday'].includes(src.anchorDay) ? src.anchorDay : 'Monday',
    exercises: Array.isArray(src.exercises) ? src.exercises : [],
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
