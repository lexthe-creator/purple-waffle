import { ALL_STATIONS } from './hyroxPlan.js';

export const HYROX_PHASE_TYPES = ['foundation', 'base', 'build', 'peak'];
export const HYROX_SESSION_TYPES = ['run', 'strength', 'hyrox', 'recovery'];
export const HYROX_INTENSITY_LEVELS = ['low', 'moderate', 'high'];

export const HYROX_WARMUP_TEMPLATES = {
  wu_run_easy: {
    id: 'wu_run_easy',
    title: 'Run prep · easy',
    steps: ['5 min brisk walk or easy jog', 'Leg swings + ankle rocks', '2 x 20 sec relaxed strides'],
  },
  wu_run_quality: {
    id: 'wu_run_quality',
    title: 'Run prep · quality',
    steps: ['8-10 min easy jog', 'A-skip/B-skip drills', '3 x 20 sec strides @ race cadence'],
  },
  wu_strength_upper: {
    id: 'wu_strength_upper',
    title: 'Upper strength prep',
    steps: ['4 min easy row or SkiErg', 'Band shoulder activation', '2 progressive warm-up sets for first lift'],
  },
  wu_strength_lower: {
    id: 'wu_strength_lower',
    title: 'Lower strength prep',
    steps: ['4 min easy bike', 'Hip + ankle mobility flow', '2 progressive warm-up sets for first lift'],
  },
  wu_hyrox_station: {
    id: 'wu_hyrox_station',
    title: 'HYROX station primer',
    steps: ['6 min easy run', 'Dynamic mobility circuit', '1 short activation round across stations'],
  },
  wu_recovery: {
    id: 'wu_recovery',
    title: 'Recovery primer',
    steps: ['3 min easy walk', 'Box breathing 4-4-6', 'Gentle dynamic mobility'],
  },
};

export const HYROX_COOLDOWN_TEMPLATES = {
  cd_run_easy: {
    id: 'cd_run_easy',
    title: 'Run reset',
    steps: ['5 min walk', 'Calf + hip flexor stretch', 'Hydration check'],
  },
  cd_run_quality: {
    id: 'cd_run_quality',
    title: 'Quality run reset',
    steps: ['8 min easy jog/walk', 'Hamstring + glute mobility', '2 min down-regulation breathing'],
  },
  cd_strength_upper: {
    id: 'cd_strength_upper',
    title: 'Upper reset',
    steps: ['Thoracic opener', 'Lat + pec stretch', 'Wrist/forearm release'],
  },
  cd_strength_lower: {
    id: 'cd_strength_lower',
    title: 'Lower reset',
    steps: ['Quad + hip flexor stretch', 'Adductor rock-backs', 'Ankle mobility work'],
  },
  cd_hyrox_station: {
    id: 'cd_hyrox_station',
    title: 'HYROX reset',
    steps: ['5 min walk', 'Full-body mobility flow', 'Breathing reset'],
  },
  cd_recovery: {
    id: 'cd_recovery',
    title: 'Recovery downshift',
    steps: ['Nasal breathing', 'Supine twist', 'Legs-up finish'],
  },
};

export const HYROX_WORKOUT_LIBRARY = [
  {
    workoutId: 'hyrox-foundation-run-aerobic-01',
    programType: 'hyrox',
    phaseType: 'foundation',
    sessionType: 'run',
    durationMinutes: 42,
    intensity: 'low',
    structure: ['35-40 min Z2 conversational run', '4 x 20 sec relaxed strides'],
    warmupTemplateId: 'wu_run_easy',
    cooldownTemplateId: 'cd_run_easy',
    tags: ['aerobic', 'engine'],
    loadLevel: 2,
    impactLevel: 2,
    hyroxStationsUsed: [],
    progressionLevel: 1,
    shortVersionRule: 'If <=30 min available, perform 24 min Z2 + 2 strides.',
  },
  {
    workoutId: 'hyrox-base-run-quality-01',
    programType: 'hyrox',
    phaseType: 'base',
    sessionType: 'run',
    durationMinutes: 50,
    intensity: 'moderate',
    structure: ['10 min warm-up jog', '5 x (3 min threshold / 2 min easy)', '8 min easy cooldown jog'],
    warmupTemplateId: 'wu_run_quality',
    cooldownTemplateId: 'cd_run_quality',
    tags: ['threshold', 'pace'],
    loadLevel: 3,
    impactLevel: 3,
    hyroxStationsUsed: [],
    progressionLevel: 2,
    shortVersionRule: 'If <=35 min available, perform 3 reps instead of 5.',
  },
  {
    workoutId: 'hyrox-base-strength-upper-01',
    programType: 'hyrox',
    phaseType: 'base',
    sessionType: 'strength',
    durationMinutes: 55,
    intensity: 'moderate',
    structure: ['Bench press 4 x 6', 'Weighted pull-up 4 x 5-6', 'SkiErg 4 x 250m', 'Single-arm row 3 x 10/side'],
    warmupTemplateId: 'wu_strength_upper',
    cooldownTemplateId: 'cd_strength_upper',
    tags: ['upper', 'strength'],
    loadLevel: 3,
    impactLevel: 2,
    hyroxStationsUsed: ['SkiErg', 'Row', 'Farmers Carry'],
    progressionLevel: 2,
    shortVersionRule: 'If <=40 min available, reduce to 3 sets on main lifts and 2 SkiErg reps.',
  },
  {
    workoutId: 'hyrox-base-strength-lower-01',
    programType: 'hyrox',
    phaseType: 'base',
    sessionType: 'strength',
    durationMinutes: 60,
    intensity: 'high',
    structure: ['Back squat 4 x 6', 'RDL 3 x 8', 'Sled push 5 x 40m', 'Walking lunge 3 x 10/side'],
    warmupTemplateId: 'wu_strength_lower',
    cooldownTemplateId: 'cd_strength_lower',
    tags: ['lower', 'strength'],
    loadLevel: 4,
    impactLevel: 3,
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Sandbag Lunges'],
    progressionLevel: 3,
    shortVersionRule: 'If <=45 min available, drop one accessory movement and keep sled quality high.',
  },
  {
    workoutId: 'hyrox-build-functional-01',
    programType: 'hyrox',
    phaseType: 'build',
    sessionType: 'hyrox',
    durationMinutes: 62,
    intensity: 'high',
    structure: ['4 rounds: 500m run', '25m sled push + 25m sled pull', '20 wall balls', 'Controlled transitions'],
    warmupTemplateId: 'wu_hyrox_station',
    cooldownTemplateId: 'cd_hyrox_station',
    tags: ['stations', 'transitions'],
    loadLevel: 4,
    impactLevel: 4,
    hyroxStationsUsed: ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Row', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball'],
    progressionLevel: 3,
    shortVersionRule: 'If <=45 min available, run 3 rounds and cut wall balls to 15/round.',
  },
  {
    workoutId: 'hyrox-peak-simulation-01',
    programType: 'hyrox',
    phaseType: 'peak',
    sessionType: 'hyrox',
    durationMinutes: 70,
    intensity: 'high',
    structure: ['3 rounds: 1km run @ race pace', 'SkiErg 750m', 'Burpee broad jump 40m', 'Farmers carry 100m', 'Wall ball 30 reps'],
    warmupTemplateId: 'wu_hyrox_station',
    cooldownTemplateId: 'cd_hyrox_station',
    tags: ['simulation', 'race-specific'],
    loadLevel: 5,
    impactLevel: 4,
    hyroxStationsUsed: ['SkiErg', 'Burpee Broad Jump', 'Farmers Carry', 'Wall Ball'],
    progressionLevel: 4,
    shortVersionRule: 'If <=50 min available, complete 2 rounds at race intent.',
  },
  {
    workoutId: 'hyrox-peak-threshold-run-01',
    programType: 'hyrox',
    phaseType: 'peak',
    sessionType: 'run',
    durationMinutes: 48,
    intensity: 'moderate',
    structure: ['12 min easy', '25 min comfortably hard tempo', '10 min easy'],
    warmupTemplateId: 'wu_run_quality',
    cooldownTemplateId: 'cd_run_quality',
    tags: ['tempo', 'race-pace'],
    loadLevel: 3,
    impactLevel: 3,
    hyroxStationsUsed: [],
    progressionLevel: 4,
    shortVersionRule: 'If <=32 min available, perform 15 min tempo between easy segments.',
  },
  {
    workoutId: 'hyrox-foundation-recovery-01',
    programType: 'hyrox',
    phaseType: 'foundation',
    sessionType: 'recovery',
    durationMinutes: 20,
    intensity: 'low',
    structure: ['4 min breathing reset', '12 min mobility flow', '10 min easy walk'],
    warmupTemplateId: 'wu_recovery',
    cooldownTemplateId: 'cd_recovery',
    tags: [],
    loadLevel: 1,
    impactLevel: 1,
    hyroxStationsUsed: [],
    progressionLevel: 1,
    shortVersionRule: 'If <=12 min available, perform breathing + 8 min mobility only.',
  },
];

export function auditHyroxWorkoutLibrary() {
  const errors = [];
  const workoutIds = new Set();
  const validStations = new Set(ALL_STATIONS);
  const warmupIds = new Set(Object.keys(HYROX_WARMUP_TEMPLATES));
  const cooldownIds = new Set(Object.keys(HYROX_COOLDOWN_TEMPLATES));

  for (const workout of HYROX_WORKOUT_LIBRARY) {
    const context = `[${workout?.workoutId || 'unknown-workout'}]`;
    if (!workout.workoutId) errors.push(`${context} missing workoutId`);
    if (workoutIds.has(workout.workoutId)) errors.push(`${context} duplicate workoutId`);
    workoutIds.add(workout.workoutId);

    if (workout.programType !== 'hyrox') errors.push(`${context} programType must equal "hyrox"`);
    if (!HYROX_PHASE_TYPES.includes(workout.phaseType)) errors.push(`${context} invalid phaseType`);
    if (!HYROX_SESSION_TYPES.includes(workout.sessionType)) errors.push(`${context} invalid sessionType`);
    if (typeof workout.durationMinutes !== 'number' || Number.isNaN(workout.durationMinutes)) errors.push(`${context} durationMinutes must be a number`);
    if (!HYROX_INTENSITY_LEVELS.includes(workout.intensity)) errors.push(`${context} invalid intensity`);
    if (!Array.isArray(workout.structure) || workout.structure.length === 0) errors.push(`${context} structure must be a non-empty array`);
    if (!warmupIds.has(workout.warmupTemplateId)) errors.push(`${context} warmupTemplateId does not resolve`);
    if (!cooldownIds.has(workout.cooldownTemplateId)) errors.push(`${context} cooldownTemplateId does not resolve`);
    if (!Array.isArray(workout.tags)) errors.push(`${context} tags field missing or invalid`);
    if (workout.loadLevel === null || workout.loadLevel === undefined) errors.push(`${context} loadLevel missing`);
    if (workout.impactLevel === null || workout.impactLevel === undefined) errors.push(`${context} impactLevel missing`);
    if (workout.progressionLevel === null || workout.progressionLevel === undefined) errors.push(`${context} progressionLevel missing`);
    if (!workout.shortVersionRule) errors.push(`${context} shortVersionRule missing`);

    if (!Array.isArray(workout.hyroxStationsUsed)) {
      errors.push(`${context} hyroxStationsUsed must be an array`);
    } else {
      workout.hyroxStationsUsed.forEach(station => {
        if (!validStations.has(station)) errors.push(`${context} invalid hyrox station: ${station}`);
      });
    }

    const requiredKeys = [
      'workoutId',
      'programType',
      'phaseType',
      'sessionType',
      'durationMinutes',
      'intensity',
      'structure',
      'warmupTemplateId',
      'cooldownTemplateId',
      'tags',
      'loadLevel',
      'impactLevel',
      'hyroxStationsUsed',
      'progressionLevel',
      'shortVersionRule',
    ];
    requiredKeys.forEach(key => {
      if (workout[key] === null || workout[key] === undefined) {
        errors.push(`${context} required field is null/undefined: ${key}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    workoutCount: HYROX_WORKOUT_LIBRARY.length,
    warmupCount: warmupIds.size,
    cooldownCount: cooldownIds.size,
    errors,
  };
}
