/**
 * Workout System Schema (PR 1.5 normalization)
 *
 * Data structures only. Generator logic remains outside this module.
 */

export const supportedProgramTypes = Object.freeze(['hyrox', '5k', 'strength_block']);
export const secondaryGoals = Object.freeze(['fat_loss', 'strength_gain', 'endurance', 'sport_skill', 'maintenance']);
export const workoutStatuses = Object.freeze(['planned', 'completed', 'skipped', 'moved', 'swapped', 'shortened']);
export const checkInResultStates = Object.freeze(['green', 'yellow', 'red']);

export const hyroxStrengthEquipmentTypes = Object.freeze([
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
]);

export const hyroxFunctionalEquipmentTypes = Object.freeze([
  'sled_push',
  'sled_pull',
  'wall_ball',
  'sandbag',
  'farmer_carry_handles',
  'battle_ropes',
  'plyo_box',
]);

export const hyroxCardioEquipmentTypes = Object.freeze([
  'treadmill',
  'outdoor_running',
  'bike',
  'rower',
  'ski_erg',
]);

export const hyroxEquipmentTypes = Object.freeze([
  ...hyroxStrengthEquipmentTypes,
  ...hyroxFunctionalEquipmentTypes,
  ...hyroxCardioEquipmentTypes,
  'bodyweight',
]);

export const programProfiles = {
  hyrox: {
    programType: 'hyrox',
    programProfileId: 'hyrox',
    displayName: 'HYROX',
    primaryGoalCategory: 'hybrid_event',
    supportedSecondaryGoals: [...secondaryGoals],
    minimumWeeks: 6,
    maximumWeeks: 32,
    durationWeeks: 32,
    defaultPhases: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
    phaseDistributionRules: {
      '6_to_8_weeks': { foundation: 1, base: 2, build: 2, peak: 1 },
      '9_to_16_weeks': { foundation: 2, base: 4, build: 5, peak: 2 },
      '17_to_24_weeks': { foundation: 3, base: 6, build: 8, peak: 3 },
      '25_to_36_weeks': { foundation: 4, base: 10, build: 14, peak: 4 },
    },
    defaultRunFrequencyStart: 2,
    defaultRunFrequencyMax: 3,
    defaultStrengthFrequency: 2,
    defaultRecoveryFrequency: 2,
    progressionStyle: 'moderate',
    requiredSessionTypes: ['strength_lower', 'strength_upper', 'run_intervals', 'conditioning_hyrox'],
    optionalSessionTypes: ['run_long', 'strength_hybrid', 'recovery_pilates', 'recovery_yoga', 'recovery_walk_mobility'],
    longRunEligible: true,
    doubleDayEligible: true,
    equipmentModesSupported: ['full_gym', 'limited_gym', 'bodyweight'],
    overlayRules: {
      runningProgression: 'start_at_2_runs_then_progress_to_3_if_tolerated',
      specificityProgression: 'increase_station_density_and_compromised_running_by_phase',
      weaknessBiasAllowed: true,
    },
    supportedDaysPerWeek: [3, 4, 5],
    defaultDaysPerWeek: 4,
    phaseSequence: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
  },
  '5k': {
    programType: '5k',
    programProfileId: '5k',
    displayName: '5K Running',
    primaryGoalCategory: 'running',
    supportedSecondaryGoals: [...secondaryGoals],
    minimumWeeks: 6,
    maximumWeeks: 12,
    durationWeeks: { min: 6, max: 12, default: 8 },
    defaultPhases: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
    phaseDistributionRules: {
      '6_to_8_weeks': { foundation: 1, base: 2, build: 2, peak: 1 },
      '9_to_12_weeks': { foundation: 2, base: 3, build: 4, peak: 2 },
    },
    defaultRunFrequencyStart: 2,
    defaultRunFrequencyMax: 5,
    defaultStrengthFrequency: 1,
    defaultRecoveryFrequency: 1,
    progressionStyle: 'progressive',
    requiredSessionTypes: ['run_easy', 'run_intervals', 'run_long'],
    optionalSessionTypes: ['run_tempo', 'recovery_pilates', 'recovery_yoga'],
    longRunEligible: true,
    doubleDayEligible: false,
    equipmentModesSupported: ['full_gym', 'limited_gym', 'bodyweight'],
    overlayRules: {
      runningProgression: 'start_at_2_runs_then_progress_to_4_if_tolerated',
      specificityProgression: 'increase_long_run_and_threshold_volume_by_phase',
      weaknessBiasAllowed: false,
    },
    supportedDaysPerWeek: [3, 4, 5],
    defaultDaysPerWeek: 4,
    phaseSequence: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
  },
  strength_block: {
    programType: 'strength_block',
    programProfileId: 'strength_block',
    displayName: 'Strength Block',
    primaryGoalCategory: 'strength',
    supportedSecondaryGoals: [...secondaryGoals],
    minimumWeeks: 4,
    maximumWeeks: 12,
    durationWeeks: { min: 4, max: 12, default: 8 },
    defaultPhases: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
    phaseDistributionRules: {
      '4_to_6_weeks': { foundation: 1, base: 1, build: 1, peak: 1 },
      '7_to_12_weeks': { foundation: 1, base: 2, build: 2, peak: 1 },
    },
    defaultRunFrequencyStart: 0,
    defaultRunFrequencyMax: 0,
    defaultStrengthFrequency: 3,
    defaultRecoveryFrequency: 1,
    progressionStyle: 'strength_cycle',
    requiredSessionTypes: ['strength_lower', 'strength_upper'],
    optionalSessionTypes: ['strength_full', 'strength_hybrid', 'recovery_walk_mobility'],
    longRunEligible: false,
    doubleDayEligible: false,
    equipmentModesSupported: ['full_gym', 'limited_gym', 'bodyweight'],
    overlayRules: {
      runningProgression: 'not_applicable',
      specificityProgression: 'progress_strength_and_accessory_volume',
      weaknessBiasAllowed: true,
    },
    supportedDaysPerWeek: [4, 5],
    defaultDaysPerWeek: 4,
    phaseSequence: ['foundation', 'base', 'build', 'peak', 'recovery_deload'],
  },
};

export const hyroxEquipmentModes = Object.freeze(['full_gym', 'limited_gym', 'bodyweight']);
export const hyroxPreferredRunModes = Object.freeze(['outdoor', 'treadmill', 'either']);
export const hyroxPreferredEngineModes = Object.freeze(['rower', 'ski_erg', 'bike', 'any']);
export const hyroxEquipmentAvailabilitySchema = Object.freeze({
  strength: [...hyroxStrengthEquipmentTypes],
  hyroxFunctional: [...hyroxFunctionalEquipmentTypes],
  cardio: [...hyroxCardioEquipmentTypes],
});
export const hyroxSessionStructureTypes = Object.freeze(['straight_sets', 'superset', 'circuit', 'hybrid_strength', 'hyrox_style']);
export const hyroxMovementSpecificityTypes = Object.freeze(['exact', 'analogous', 'fallback']);
export const hyroxMovementCategories = Object.freeze([
  'squat_pattern',
  'hinge_pattern',
  'lunge_pattern',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'engine_run',
  'engine_machine',
  'full_body_conditioning',
  'squat_press_endurance',
  'core_stability',
  'locomotion_power',
]);

export const userTrainingProfileSchema = Object.freeze({
  requiredFields: [
    'userId',
    'primaryGoal',
    'secondaryGoal',
    'targetEventDate',
    'planStartDate',
    'availableDaysPerWeek',
    'doubleDaysEnabled',
    'preferredTrainingTime',
    'currentFitnessLevel',
    'currentRunFrequency',
    'desiredRunFrequency',
    'longRunPreferenceFromStart',
    'pilatesPreferencePerWeek',
    'yogaPreferencePerWeek',
    'strengthPreferencePerWeek',
    'equipmentMode',
    'recoveryProfile',
    'adherencePriority',
    'experienceLevelByDiscipline',
    'limitations',
    'phaseOverrideAllowed',
  ],
  optionalFields: [
    'currentLongRunDistance',
    'recentRaceHistory',
    'hyroxWeakStations',
    'stressLevel',
    'sleepAverageHours',
    'cycleTrackingEnabled',
    'bodyWeight',
    'goalFinishTime',
    'notes',
  ],
  currentSupportedFields: {
    programType: supportedProgramTypes,
    programStartDate: 'YYYY-MM-DD',
    trainingDays: ['3-day', '4-day', '5-day'],
    raceDate: 'YYYY-MM-DD',
    raceName: 'string',
    raceCategory: 'string',
    goalFinishTime: 'string',
    equipmentAccess: ['full-gym', 'limited', 'bodyweight-only'],
    equipmentMode: hyroxEquipmentModes,
    preferredEquipmentTags: 'string[]',
    preferredRunMode: hyroxPreferredRunModes,
    preferredEngineModes: hyroxPreferredEngineModes,
  },
});

export const phaseRules = {
  foundation: {
    phaseType: 'foundation',
    displayName: 'Foundation',
    startWeek: 1,
    endWeek: 6,
    goal: 'Movement prep and aerobic base',
  },
  base: {
    phaseType: 'base',
    displayName: 'Base',
    startWeek: 7,
    endWeek: 12,
    goal: 'Build sustainable volume',
  },
  build: {
    phaseType: 'build',
    displayName: 'Build',
    startWeek: 13,
    endWeek: 24,
    goal: 'Raise specificity and workload',
  },
  peak: {
    phaseType: 'peak',
    displayName: 'Peak',
    startWeek: 25,
    endWeek: 29,
    goal: 'Race-specific sharpening',
  },
  recovery_deload: {
    phaseType: 'recovery_deload',
    displayName: 'Recovery / Deload',
    startWeek: 30,
    endWeek: 32,
    goal: 'Reduce fatigue and consolidate adaptation',
  },
};

export const sessionTypes = {
  strength_lower: {
    sessionTypeId: 'strength_lower',
    category: 'strength',
    displayName: 'Lower Strength',
    duration: 60,
    objective: 'Build force for push/pull/lunge demands.',
    stations: ['Sled Push', 'Sled Pull', 'Sandbag Lunges'],
    winTheDayTargets: ['Primary lift completed', 'Sled quality reps', 'Mobility finish'],
  },
  strength_upper: {
    sessionTypeId: 'strength_upper',
    category: 'strength',
    displayName: 'Upper Strength',
    duration: 55,
    objective: 'Build pull/press durability for stations.',
    stations: ['SkiErg', 'Row', 'Farmers Carry'],
    winTheDayTargets: ['All prescribed sets', 'No rushed rest', 'Technique above load'],
  },
  strength_full: {
    sessionTypeId: 'strength_full',
    category: 'strength',
    displayName: 'Full Body Strength',
    duration: 58,
    objective: 'Integrate total-body lifting patterns for durability.',
    winTheDayTargets: ['Stable technique', 'Intentional loading', 'Finish all work sets'],
  },
  strength_hybrid: {
    sessionTypeId: 'strength_hybrid',
    category: 'strength',
    displayName: 'Hybrid Strength',
    duration: 55,
    objective: 'Blend strength and movement transitions under fatigue.',
    winTheDayTargets: ['Quality transitions', 'Controlled pacing', 'Consistent output'],
  },
  run_intervals: {
    sessionTypeId: 'run_intervals',
    category: 'run',
    displayName: 'Run Intervals',
    duration: 48,
    objective: 'Raise threshold pace and race repeatability.',
    winTheDayTargets: ['Warm-up completed', 'Hit quality paces', 'Cooldown + notes logged'],
  },
  run_tempo: {
    sessionTypeId: 'run_tempo',
    category: 'run',
    displayName: 'Run Tempo',
    duration: 50,
    objective: 'Push sustainable race pace.',
    winTheDayTargets: ['No pace fade', 'Breathing under control', 'Log average pace'],
  },
  run_easy: {
    sessionTypeId: 'run_easy',
    category: 'run',
    displayName: 'Easy Run',
    duration: 42,
    objective: 'Build aerobic durability.',
    winTheDayTargets: ['Conversational effort', 'Smooth cadence', 'Post-run mobility 5 min'],
  },
  run_long: {
    sessionTypeId: 'run_long',
    category: 'run',
    displayName: 'Long Run',
    duration: 65,
    objective: 'Extend aerobic durability and pacing control.',
    winTheDayTargets: ['Steady Z2 effort', 'Hydration pacing', 'Strong final 10 minutes'],
  },
  conditioning_hyrox: {
    sessionTypeId: 'conditioning_hyrox',
    category: 'conditioning',
    displayName: 'HYROX Conditioning',
    duration: 62,
    objective: 'Station transitions under fatigue.',
    stations: ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball'],
    winTheDayTargets: ['Steady transitions', 'Controlled breathing', 'Even output by round'],
  },
  conditioning_engine: {
    sessionTypeId: 'conditioning_engine',
    category: 'conditioning',
    displayName: 'Engine Conditioning',
    duration: 50,
    objective: 'Develop repeatable aerobic power.',
    winTheDayTargets: ['Even splits', 'Sustained breathing rhythm', 'No output drop-off'],
  },
  conditioning_circuit: {
    sessionTypeId: 'conditioning_circuit',
    category: 'conditioning',
    displayName: 'Conditioning Circuit',
    duration: 70,
    objective: 'Race confidence through mixed-modality rounds.',
    stations: ['SkiErg', 'Burpee Broad Jump', 'Farmers Carry', 'Wall Ball'],
    winTheDayTargets: ['Race pacing discipline', 'No long breaks', 'Recovery protocol complete'],
  },
  recovery_pilates: {
    sessionTypeId: 'recovery_pilates',
    category: 'recovery',
    displayName: 'Recovery Pilates',
    duration: 30,
    objective: 'Restore trunk control and low-intensity movement quality.',
    winTheDayTargets: ['Nasal breathing', 'Core control', 'Leave session refreshed'],
  },
  recovery_yoga: {
    sessionTypeId: 'recovery_yoga',
    category: 'recovery',
    displayName: 'Recovery Yoga',
    duration: 30,
    objective: 'Down-regulate stress and improve mobility.',
    winTheDayTargets: ['Smooth breath cadence', 'Joint-friendly range', 'Relaxed finish'],
  },
  recovery_walk_mobility: {
    sessionTypeId: 'recovery_walk_mobility',
    category: 'recovery',
    displayName: 'Walk + Mobility',
    duration: 20,
    objective: 'Downshift while preserving movement quality.',
    winTheDayTargets: ['Breathing reset', 'Hips/ankles open', 'Hydration + sleep plan'],
  },
};

export const weeklyTemplates = [
  {
    weeklyTemplateId: '5k_foundation_3_1',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_foundation_3_2',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_easy', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_foundation_4_1',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_easy', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_foundation_4_2',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_easy', 'run_tempo', 'recovery_yoga', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_foundation_5_1',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'recovery_pilates', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_foundation_5_2',
    programType: '5k',
    phaseType: 'foundation',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_easy', 'run_tempo', 'recovery_yoga', 'run_intervals', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_base_3_1',
    programType: '5k',
    phaseType: 'base',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_base_4_1',
    programType: '5k',
    phaseType: 'base',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_easy', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_base_5_1',
    programType: '5k',
    phaseType: 'base',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'recovery_pilates', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_build_3_1',
    programType: '5k',
    phaseType: 'build',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_build_4_1',
    programType: '5k',
    phaseType: 'build',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_easy', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_build_5_1',
    programType: '5k',
    phaseType: 'build',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'recovery_pilates', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_peak_3_1',
    programType: '5k',
    phaseType: 'peak',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_peak_4_1',
    programType: '5k',
    phaseType: 'peak',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_peak_5_1',
    programType: '5k',
    phaseType: 'peak',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'recovery_pilates', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_recovery_deload_3_1',
    programType: '5k',
    phaseType: 'recovery_deload',
    daysPerWeek: 3,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'recovery_yoga', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_recovery_deload_4_1',
    programType: '5k',
    phaseType: 'recovery_deload',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_tempo', 'recovery_pilates', 'run_long'],
  },
  {
    weeklyTemplateId: '5k_recovery_deload_5_1',
    programType: '5k',
    phaseType: 'recovery_deload',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['run_easy', 'run_intervals', 'recovery_yoga', 'run_tempo', 'run_long'],
  },
  {
    weeklyTemplateId: 'hyrox_foundation_4_1',
    programType: 'hyrox',
    phaseType: 'foundation',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_foundation_4_2',
    programType: 'hyrox',
    phaseType: 'foundation',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_tempo', 'conditioning_engine', 'run_easy', 'strength_lower'],
  },
  {
    weeklyTemplateId: 'hyrox_foundation_5_1',
    programType: 'hyrox',
    phaseType: 'foundation',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'run_easy', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_foundation_5_2',
    programType: 'hyrox',
    phaseType: 'foundation',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_intervals', 'conditioning_engine', 'run_easy', 'strength_lower', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_base_4_1',
    programType: 'hyrox',
    phaseType: 'base',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_base_4_2',
    programType: 'hyrox',
    phaseType: 'base',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_tempo', 'conditioning_hyrox', 'run_easy', 'strength_lower'],
  },
  {
    weeklyTemplateId: 'hyrox_base_5_1',
    programType: 'hyrox',
    phaseType: 'base',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'run_easy', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_base_5_2',
    programType: 'hyrox',
    phaseType: 'base',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_intervals', 'conditioning_hyrox', 'run_easy', 'strength_lower', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_build_4_1',
    programType: 'hyrox',
    phaseType: 'build',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_hybrid', 'run_intervals', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_build_4_2',
    programType: 'hyrox',
    phaseType: 'build',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_tempo', 'conditioning_hyrox', 'run_easy', 'strength_hybrid'],
  },
  {
    weeklyTemplateId: 'hyrox_build_5_1',
    programType: 'hyrox',
    phaseType: 'build',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'run_easy', 'strength_lower', 'conditioning_hyrox'],
  },
  {
    weeklyTemplateId: 'hyrox_build_5_2',
    programType: 'hyrox',
    phaseType: 'build',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_intervals', 'conditioning_hyrox', 'run_easy', 'strength_hybrid', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_peak_4_1',
    programType: 'hyrox',
    phaseType: 'peak',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_hybrid', 'run_intervals', 'run_tempo', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_peak_4_2',
    programType: 'hyrox',
    phaseType: 'peak',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_tempo', 'conditioning_hyrox', 'run_easy', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_peak_5_1',
    programType: 'hyrox',
    phaseType: 'peak',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['strength_upper', 'run_intervals', 'run_easy', 'strength_hybrid', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_peak_5_2',
    programType: 'hyrox',
    phaseType: 'peak',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['run_tempo', 'conditioning_hyrox', 'run_easy', 'conditioning_engine', 'conditioning_circuit'],
  },
  {
    weeklyTemplateId: 'hyrox_recovery_deload_4_1',
    programType: 'hyrox',
    phaseType: 'recovery_deload',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['recovery_walk_mobility', 'run_easy', 'strength_full', 'recovery_yoga'],
  },
  {
    weeklyTemplateId: 'hyrox_recovery_deload_4_2',
    programType: 'hyrox',
    phaseType: 'recovery_deload',
    daysPerWeek: 4,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['recovery_walk_mobility', 'run_easy', 'strength_hybrid', 'recovery_pilates'],
  },
  {
    weeklyTemplateId: 'hyrox_recovery_deload_5_1',
    programType: 'hyrox',
    phaseType: 'recovery_deload',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 1,
    dayPattern: ['recovery_walk_mobility', 'run_easy', 'strength_full', 'conditioning_engine', 'recovery_yoga'],
  },
  {
    weeklyTemplateId: 'hyrox_recovery_deload_5_2',
    programType: 'hyrox',
    phaseType: 'recovery_deload',
    daysPerWeek: 5,
    doubleDaysEnabled: false,
    templatePriority: 2,
    dayPattern: ['recovery_walk_mobility', 'run_easy', 'strength_hybrid', 'conditioning_engine', 'recovery_pilates'],
  },
];

export const warmupTemplates = {
  run_standard_v1: {
    warmupTemplateId: 'run_standard_v1',
    templateType: 'run',
    displayName: 'Run Standard Warm-up',
    durationMinutes: 10,
    blocks: [{ instruction: '10 min easy jog + drills' }],
  },
  strength_standard_v1: {
    warmupTemplateId: 'strength_standard_v1',
    templateType: 'strength',
    displayName: 'Strength Standard Warm-up',
    durationMinutes: 10,
    blocks: [{ instruction: 'Activation + ramp sets' }],
  },
  conditioning_standard_v1: {
    warmupTemplateId: 'conditioning_standard_v1',
    templateType: 'conditioning',
    displayName: 'Conditioning Standard Warm-up',
    durationMinutes: 10,
    blocks: [{ instruction: 'Mixed movement prep' }],
  },
  recovery_reset_v1: {
    warmupTemplateId: 'recovery_reset_v1',
    templateType: 'recovery',
    displayName: 'Recovery Reset Warm-up',
    durationMinutes: 7,
    blocks: [{ instruction: 'Breathing + gentle mobility flow' }],
  },
  hyrox_standard_v1: {
    warmupTemplateId: 'hyrox_standard_v1',
    templateType: 'hyrox',
    displayName: 'HYROX Standard Warm-up',
    durationMinutes: 10,
    blocks: [{ instruction: 'Easy engine + station prep + strides' }],
  },
};

export const cooldownTemplates = {
  run_standard_v1: {
    cooldownTemplateId: 'run_standard_v1',
    templateType: 'run',
    displayName: 'Run Standard Cooldown',
    durationMinutes: 8,
    blocks: [{ instruction: 'Easy jog and breathing reset' }],
  },
  strength_standard_v1: {
    cooldownTemplateId: 'strength_standard_v1',
    templateType: 'strength',
    displayName: 'Strength Standard Cooldown',
    durationMinutes: 8,
    blocks: [{ instruction: 'Breathing + mobility reset' }],
  },
  conditioning_standard_v1: {
    cooldownTemplateId: 'conditioning_standard_v1',
    templateType: 'conditioning',
    displayName: 'Conditioning Standard Cooldown',
    durationMinutes: 10,
    blocks: [{ instruction: 'Walk + down-regulation' }],
  },
  recovery_reset_v1: {
    cooldownTemplateId: 'recovery_reset_v1',
    templateType: 'recovery',
    displayName: 'Recovery Reset Cooldown',
    durationMinutes: 5,
    blocks: [{ instruction: 'Breathing reset and gentle mobility' }],
  },
  hyrox_standard_v1: {
    cooldownTemplateId: 'hyrox_standard_v1',
    templateType: 'hyrox',
    displayName: 'HYROX Standard Cooldown',
    durationMinutes: 6,
    blocks: [{ instruction: 'Easy walk or machine + lower-body mobility' }],
  },
};

export const workoutLibrary = {
  hyrox: {
    foundation: [
      {
        workoutLibraryId: 'hyrox_foundation_strength_full_01',
        programType: 'hyrox',
        phaseType: 'foundation',
        sessionTypeId: 'strength_full',
        displayName: 'Foundation Full Strength',
        warmupTemplateId: 'strength_standard_v1',
        cooldownTemplateId: 'strength_standard_v1',
        blocks: [
          { blockId: 'a', focus: 'squat_pattern', prescription: '4 x 6 @ moderate load' },
          { blockId: 'b', focus: 'hinge_pattern', prescription: '3 x 8 controlled tempo' },
          { blockId: 'c', focus: 'carry_pattern', prescription: '4 x 40m moderate load' },
        ],
      },
      {
        workoutLibraryId: 'hyrox_foundation_run_easy_01',
        programType: 'hyrox',
        phaseType: 'foundation',
        sessionTypeId: 'run_easy',
        displayName: 'Foundation Easy Run',
        warmupTemplateId: 'run_standard_v1',
        cooldownTemplateId: 'run_standard_v1',
        blocks: [{ blockId: 'a', focus: 'aerobic_base', prescription: '35-45 min Z2 + 4 strides' }],
      },
    ],
    base: [
      {
        workoutLibraryId: 'hyrox_base_strength_hybrid_01',
        programType: 'hyrox',
        phaseType: 'base',
        sessionTypeId: 'strength_hybrid',
        displayName: 'Base Hybrid Strength',
        warmupTemplateId: 'strength_standard_v1',
        cooldownTemplateId: 'strength_standard_v1',
        blocks: [
          { blockId: 'a', focus: 'compound_lift', prescription: '5 x 5 @ RPE 7' },
          { blockId: 'b', focus: 'push_pull_pair', prescription: '4 rounds, controlled rest' },
          { blockId: 'c', focus: 'engine_finisher', prescription: '6 min quality AMRAP' },
        ],
      },
      {
        workoutLibraryId: 'hyrox_base_conditioning_hyrox_01',
        programType: 'hyrox',
        phaseType: 'base',
        sessionTypeId: 'conditioning_hyrox',
        displayName: 'Base HYROX Conditioning',
        warmupTemplateId: 'conditioning_standard_v1',
        cooldownTemplateId: 'conditioning_standard_v1',
        blocks: [
          { blockId: 'a', focus: 'transitions', prescription: '4 rounds: 500m run + station pair' },
          { blockId: 'b', focus: 'skill_quality', prescription: '3 x 20 wall balls with pacing' },
        ],
      },
    ],
    build: [
      {
        workoutLibraryId: 'hyrox_build_run_intervals_01',
        programType: 'hyrox',
        phaseType: 'build',
        sessionTypeId: 'run_intervals',
        displayName: 'Build Intervals',
        warmupTemplateId: 'run_standard_v1',
        cooldownTemplateId: 'run_standard_v1',
        blocks: [{ blockId: 'a', focus: 'threshold_repeatability', prescription: '6 x 3 min hard / 2 min easy' }],
      },
      {
        workoutLibraryId: 'hyrox_build_conditioning_engine_01',
        programType: 'hyrox',
        phaseType: 'build',
        sessionTypeId: 'conditioning_engine',
        displayName: 'Build Engine',
        warmupTemplateId: 'conditioning_standard_v1',
        cooldownTemplateId: 'conditioning_standard_v1',
        blocks: [{ blockId: 'a', focus: 'aerobic_power', prescription: '5 x 6 min at strong sustainable pace' }],
      },
    ],
    peak: [
      {
        workoutLibraryId: 'hyrox_peak_conditioning_circuit_01',
        programType: 'hyrox',
        phaseType: 'peak',
        sessionTypeId: 'conditioning_circuit',
        displayName: 'Peak Race Circuit',
        warmupTemplateId: 'conditioning_standard_v1',
        cooldownTemplateId: 'conditioning_standard_v1',
        blocks: [{ blockId: 'a', focus: 'race_specificity', prescription: '3 rounds: 1km run + 3 stations' }],
      },
      {
        workoutLibraryId: 'hyrox_peak_run_tempo_01',
        programType: 'hyrox',
        phaseType: 'peak',
        sessionTypeId: 'run_tempo',
        displayName: 'Peak Tempo Run',
        warmupTemplateId: 'run_standard_v1',
        cooldownTemplateId: 'run_standard_v1',
        blocks: [{ blockId: 'a', focus: 'race_pace_control', prescription: '25-30 min comfortably hard' }],
      },
    ],
  },
};

export const substitutions = {
  hyrox_foundation_strength_full_01: [
    { from: 'squat_pattern', to: 'leg_press', reason: 'limited barbell access' },
    { from: 'carry_pattern', to: 'farmer_hold_march', reason: 'space constraints' },
  ],
  hyrox_base_conditioning_hyrox_01: [
    { from: 'row', to: 'ski_erg', reason: 'equipment availability' },
    { from: 'burpee_broad_jump', to: 'burpee_step_out', reason: 'impact reduction' },
  ],
  hyrox_build_run_intervals_01: [{ from: 'track_repeats', to: 'treadmill_intervals', reason: 'weather fallback' }],
  hyrox_peak_conditioning_circuit_01: [{ from: 'wall_ball', to: 'thruster_light', reason: 'wall-ball target unavailable' }],
};

export const shortVersions = {
  hyrox_foundation_strength_full_01: {
    shortVersionId: 'hyrox_foundation_strength_full_01_short',
    workoutLibraryId: 'hyrox_foundation_strength_full_01',
    durationMinutes: 35,
    blocks: [
      { blockId: 'a', prescription: '3 x 6 @ moderate load' },
      { blockId: 'b', prescription: '2 x 8 controlled tempo' },
    ],
  },
  hyrox_base_conditioning_hyrox_01: {
    shortVersionId: 'hyrox_base_conditioning_hyrox_01_short',
    workoutLibraryId: 'hyrox_base_conditioning_hyrox_01',
    durationMinutes: 35,
    blocks: [{ blockId: 'a', prescription: '3 rounds: 500m run + station pair' }],
  },
  hyrox_build_run_intervals_01: {
    shortVersionId: 'hyrox_build_run_intervals_01_short',
    workoutLibraryId: 'hyrox_build_run_intervals_01',
    durationMinutes: 30,
    blocks: [{ blockId: 'a', prescription: '4 x 3 min hard / 2 min easy' }],
  },
  hyrox_peak_conditioning_circuit_01: {
    shortVersionId: 'hyrox_peak_conditioning_circuit_01_short',
    workoutLibraryId: 'hyrox_peak_conditioning_circuit_01',
    durationMinutes: 40,
    blocks: [{ blockId: 'a', prescription: '2 rounds: 1km run + 3 stations' }],
  },
};

function validateProgramProfile(profile, programType) {
  const issues = [];
  const requiredStrings = [
    'programType',
    'programProfileId',
    'displayName',
    'primaryGoalCategory',
    'progressionStyle',
  ];
  for (const field of requiredStrings) {
    if (typeof profile?.[field] !== 'string' || profile[field].length === 0) {
      issues.push(`Missing ${field} on ${programType}`);
    }
  }
  if (profile?.programType !== programType) {
    issues.push(`programType mismatch on ${programType}`);
  }
  if (!Array.isArray(profile?.supportedSecondaryGoals) || profile.supportedSecondaryGoals.some(goal => !secondaryGoals.includes(goal))) {
    issues.push(`Invalid supportedSecondaryGoals on ${programType}`);
  }
  if (!Number.isFinite(profile?.minimumWeeks) || !Number.isFinite(profile?.maximumWeeks) || profile.minimumWeeks > profile.maximumWeeks) {
    issues.push(`Invalid week bounds on ${programType}`);
  }
  if (!Array.isArray(profile?.phaseSequence) || profile.phaseSequence.some(phase => !phaseRules[phase])) {
    issues.push(`Invalid phaseSequence on ${programType}`);
  }
  if (!Array.isArray(profile?.supportedDaysPerWeek) || profile.supportedDaysPerWeek.some(day => !Number.isInteger(day) || day < 3 || day > 5)) {
    issues.push(`Invalid supportedDaysPerWeek on ${programType}`);
  }
  if (!profile?.supportedDaysPerWeek?.includes(profile.defaultDaysPerWeek)) {
    issues.push(`defaultDaysPerWeek must be included in supportedDaysPerWeek on ${programType}`);
  }
  if (!Array.isArray(profile?.requiredSessionTypes) || profile.requiredSessionTypes.some(sessionType => !sessionTypes[sessionType])) {
    issues.push(`Invalid requiredSessionTypes on ${programType}`);
  }
  if (!Array.isArray(profile?.optionalSessionTypes) || profile.optionalSessionTypes.some(sessionType => !sessionTypes[sessionType])) {
    issues.push(`Invalid optionalSessionTypes on ${programType}`);
  }
  if (!Array.isArray(profile?.equipmentModesSupported) || profile.equipmentModesSupported.some(mode => !hyroxEquipmentModes.includes(mode))) {
    issues.push(`Invalid equipmentModesSupported on ${programType}`);
  }
  if (!Array.isArray(profile?.defaultPhases) || profile.defaultPhases.some(phase => !phaseRules[phase])) {
    issues.push(`Invalid defaultPhases on ${programType}`);
  }
  return issues;
}

function validateWeeklyTemplate(template) {
  const issues = [];
  if (!template || typeof template !== 'object') return ['Invalid weekly template entry'];
  if (!supportedProgramTypes.includes(template.programType)) issues.push(`Invalid programType on ${template.weeklyTemplateId}`);
  if (!phaseRules[template.phaseType]) issues.push(`Invalid phaseType on ${template.weeklyTemplateId}`);
  if (!Array.isArray(template.dayPattern) || template.dayPattern.length !== template.daysPerWeek) {
    issues.push(`Invalid dayPattern length on ${template.weeklyTemplateId}`);
  }
  if (!Array.isArray(template.dayPattern) || template.dayPattern.some(sessionType => !sessionTypes[sessionType])) {
    issues.push(`Invalid dayPattern sessionType on ${template.weeklyTemplateId}`);
  }
  if (!profileDaysSupported(template.programType, template.daysPerWeek)) {
    issues.push(`Unsupported daysPerWeek on ${template.weeklyTemplateId}`);
  }
  return issues;
}

function profileDaysSupported(programType, daysPerWeek) {
  const profile = programProfiles[programType];
  return Boolean(profile && Array.isArray(profile.supportedDaysPerWeek) && profile.supportedDaysPerWeek.includes(daysPerWeek));
}

export function validateWorkoutSystemSchema() {
  const issues = [];

  if (!supportedProgramTypes.includes('hyrox') || !supportedProgramTypes.includes('5k') || !supportedProgramTypes.includes('strength_block')) {
    issues.push('supportedProgramTypes must include hyrox, 5k, and strength_block');
  }

  for (const programType of supportedProgramTypes) {
    issues.push(...validateProgramProfile(programProfiles[programType], programType));
  }

  if (!Array.isArray(secondaryGoals) || secondaryGoals.length === 0) {
    issues.push('secondaryGoals must be a non-empty array');
  }

  if (!Array.isArray(workoutStatuses) || workoutStatuses.length === 0) {
    issues.push('workoutStatuses must be a non-empty array');
  }

  if (!Array.isArray(checkInResultStates) || checkInResultStates.length !== 3) {
    issues.push('checkInResultStates must contain green, yellow, and red');
  }

  if (!Array.isArray(hyroxEquipmentModes) || hyroxEquipmentModes.some(mode => !['full_gym', 'limited_gym', 'bodyweight'].includes(mode))) {
    issues.push('hyroxEquipmentModes contains an invalid value');
  }

  for (const [groupName, values] of Object.entries(hyroxEquipmentAvailabilitySchema)) {
    if (!Array.isArray(values) || values.some(value => !hyroxEquipmentTypes.includes(value))) {
      issues.push(`Invalid equipment availability schema group: ${groupName}`);
    }
  }

  if (!Array.isArray(hyroxMovementCategories) || hyroxMovementCategories.length === 0) {
    issues.push('hyroxMovementCategories must be a non-empty array');
  }

  if (!Array.isArray(hyroxMovementSpecificityTypes) || hyroxMovementSpecificityTypes.length !== 3) {
    issues.push('hyroxMovementSpecificityTypes must contain exact, analogous, and fallback');
  }

  if (!Array.isArray(hyroxSessionStructureTypes) || !hyroxSessionStructureTypes.includes('hybrid_strength') || !hyroxSessionStructureTypes.includes('superset')) {
    issues.push('hyroxSessionStructureTypes must include superset and hybrid_strength');
  }

  if (!Array.isArray(userTrainingProfileSchema.requiredFields) || userTrainingProfileSchema.requiredFields.length === 0) {
    issues.push('userTrainingProfileSchema.requiredFields must be non-empty');
  }
  if (!Array.isArray(userTrainingProfileSchema.optionalFields)) {
    issues.push('userTrainingProfileSchema.optionalFields must be an array');
  }

  for (const template of weeklyTemplates) {
    issues.push(...validateWeeklyTemplate(template));
  }

  for (const [templateId, template] of Object.entries(warmupTemplates)) {
    if (!template || template.warmupTemplateId !== templateId || !template.templateType || typeof template.displayName !== 'string') {
      issues.push(`Invalid warmup template: ${templateId}`);
    }
  }

  for (const [templateId, template] of Object.entries(cooldownTemplates)) {
    if (!template || template.cooldownTemplateId !== templateId || !template.templateType || typeof template.displayName !== 'string') {
      issues.push(`Invalid cooldown template: ${templateId}`);
    }
  }

  for (const [programType, phases] of Object.entries(workoutLibrary)) {
    if (!programProfiles[programType]) {
      issues.push(`Invalid workoutLibrary programType: ${programType}`);
      continue;
    }
    if (!phases || typeof phases !== 'object') {
      issues.push(`Invalid workoutLibrary bucket for ${programType}`);
      continue;
    }
    for (const [phaseType, workouts] of Object.entries(phases)) {
      if (!phaseRules[phaseType]) {
        issues.push(`Invalid workoutLibrary phaseType: ${programType}.${phaseType}`);
        continue;
      }
      if (!Array.isArray(workouts)) {
        issues.push(`Invalid workoutLibrary phase bucket: ${programType}.${phaseType}`);
      }
    }
  }

  for (const [shortVersionId, shortVersion] of Object.entries(shortVersions)) {
    if (!shortVersion || typeof shortVersion.shortVersionId !== 'string' || typeof shortVersion.workoutLibraryId !== 'string') {
      issues.push(`Invalid shortVersion entry: ${shortVersionId}`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

// Assumption: consolidated schema export supports future dynamic generator modules.
export const workoutSystemSchema = {
  supportedProgramTypes,
  secondaryGoals,
  workoutStatuses,
  checkInResultStates,
  hyroxStrengthEquipmentTypes,
  hyroxFunctionalEquipmentTypes,
  hyroxCardioEquipmentTypes,
  hyroxEquipmentTypes,
  programProfiles,
  phaseRules,
  sessionTypes,
  weeklyTemplates,
  warmupTemplates,
  cooldownTemplates,
  workoutLibrary,
  substitutions,
  shortVersions,
  hyroxEquipmentModes,
  hyroxPreferredRunModes,
  hyroxPreferredEngineModes,
  hyroxEquipmentAvailabilitySchema,
  hyroxSessionStructureTypes,
  hyroxMovementSpecificityTypes,
  hyroxMovementCategories,
  userTrainingProfileSchema,
};
