import { ALL_STATIONS } from './hyroxPlan.js';
import {
  HYROX_CANONICAL_SESSION_TYPES,
  HYROX_LEGACY_SESSION_TYPES,
  isCompatibleHyroxSessionType,
  mapLibraryPhaseToSchedulePhase,
  mapSchedulePhaseToLibraryPhase,
  normalizeHyroxSessionType,
  toLegacyHyroxSessionType,
} from './hyroxAdapters.js';

const PHASE_LABELS = {
  foundation: 'Foundation',
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
};

const SHORT_VERSION_RULE = 'Reduce total duration by about 25%, remove one round from the main set, and keep the same station order and intent.';

function block(blockId, name, durationMinutes, details, stationsUsed = []) {
  return {
    blockId,
    name,
    durationMinutes,
    details,
    stationsUsed,
  };
}

function workout(definition) {
  return {
    workoutId: definition.workoutId,
    programType: 'hyrox',
    phaseType: definition.phaseType,
    schedulePhaseType: mapLibraryPhaseToSchedulePhase(definition.phaseType),
    phaseLabel: PHASE_LABELS[definition.phaseType] || definition.phaseType,
    sessionType: definition.sessionType,
    sessionTypeCanonical: normalizeHyroxSessionType(definition.sessionType),
    sessionTypeLegacy: toLegacyHyroxSessionType(definition.sessionType),
    durationMinutes: definition.durationMinutes,
    intensity: definition.intensity,
    structure: definition.structure.map(item => ({ ...item, stationsUsed: [...(item.stationsUsed || [])] })),
    warmupTemplateId: definition.warmupTemplateId,
    cooldownTemplateId: definition.cooldownTemplateId,
    tags: [...definition.tags],
    loadLevel: definition.loadLevel,
    impactLevel: definition.impactLevel,
    hyroxStationsUsed: [...definition.hyroxStationsUsed],
    progressionLevel: definition.progressionLevel,
    shortVersionRule: SHORT_VERSION_RULE,
  };
}

export const HYROX_WARMUP_TEMPLATES = {
  hyrox_functional_warmup: {
    templateId: 'hyrox_functional_warmup',
    sessionType: 'hyrox_functional',
    durationMinutes: 12,
    blocks: [
      block('wu-1', 'Raise', 4, 'Easy row, jog, or bike to lift temperature.'),
      block('wu-2', 'Mobilize', 4, 'Open hips, ankles, thoracic spine, and shoulders.'),
      block('wu-3', 'Prime', 4, 'Short pickups and station mechanics.'),
    ],
  },
  hyrox_simulation_warmup: {
    templateId: 'hyrox_simulation_warmup',
    sessionType: 'hyrox_simulation',
    durationMinutes: 14,
    blocks: [
      block('wu-1', 'Raise', 5, 'Easy run with breathing control.'),
      block('wu-2', 'Mobilize', 4, 'Station-specific mobility and hinge prep.'),
      block('wu-3', 'Activate', 5, 'Short station primers and run strides.'),
    ],
  },
};

export const HYROX_COOLDOWN_TEMPLATES = {
  hyrox_functional_cooldown: {
    templateId: 'hyrox_functional_cooldown',
    sessionType: 'hyrox_functional',
    durationMinutes: 10,
    blocks: [
      block('cd-1', 'Downshift', 4, 'Walk or easy spin until breathing settles.'),
      block('cd-2', 'Release', 3, 'Hips, calves, lats, and trunk rotation.'),
      block('cd-3', 'Reset', 3, 'Breathing work to finish calm and upright.'),
    ],
  },
  hyrox_simulation_cooldown: {
    templateId: 'hyrox_simulation_cooldown',
    sessionType: 'hyrox_simulation',
    durationMinutes: 12,
    blocks: [
      block('cd-1', 'Downshift', 5, 'Walk until heart rate drops.'),
      block('cd-2', 'Release', 4, 'Longer holds for hips, quads, lats, and calves.'),
      block('cd-3', 'Reset', 3, 'Breathing and rib-cage expansion drills.'),
    ],
  },
};

export const HYROX_SUBSTITUTIONS = {
  full_gym: {
    'SkiErg': ['Row 1000m', 'Assault bike 45 calories'],
    'Sled Push': ['Heavy prowler push', 'Plate-loaded turf push'],
    'Sled Pull': ['Rope sled drag', 'Cable drag walk'],
    'Burpee Broad Jump': ['Burpee to target', 'Burpee + tuck jump'],
    'Row': ['SkiErg 1000m', 'Assault bike 45 calories'],
    'Farmers Carry': ['Heavy kettlebell carry', 'Trap bar carry'],
    'Sandbag Lunges': ['Front rack lunge', 'Goblet walking lunge'],
    'Wall Ball': ['Dumbbell thruster', 'Med ball squat throw'],
  },
  limited_gym: {
    'SkiErg': ['Row 1000m', 'Incline treadmill run 8 min'],
    'Sled Push': ['Treadmill push-off drive', 'Heavy walking lunge march'],
    'Sled Pull': ['Band row march', 'Backward treadmill walk'],
    'Burpee Broad Jump': ['Burpee step-up', 'Squat thrust broad step'],
    'Row': ['Fast run 800m', 'High-knee interval 2 min'],
    'Farmers Carry': ['Dumbbell suitcase carry', 'Front rack plate carry'],
    'Sandbag Lunges': ['Reverse lunges', 'Split squat tempo reps'],
    'Wall Ball': ['DB thruster', 'Air squat to reach'],
  },
  bodyweight: {
    'SkiErg': ['High knees', 'Mountain climbers'],
    'Sled Push': ['Wall drive march', 'Hill sprint'],
    'Sled Pull': ['Bear crawl drag', 'Prone towel row isometric'],
    'Burpee Broad Jump': ['Squat thrusts', 'Plank walkout jumps'],
    'Row': ['Shadow boxing intervals', 'Quick-feet intervals'],
    'Farmers Carry': ['Backpack bear hug march', 'March in place with brace'],
    'Sandbag Lunges': ['Walking lunges', 'Split squat isometric holds'],
    'Wall Ball': ['Tempo air squats', 'Squat to overhead reach'],
  },
};

const FOUNDATION_WORKOUTS = [
  workout({
    workoutId: 'foundation-01',
    phaseType: 'foundation',
    sessionType: 'hyrox_functional',
    durationMinutes: 42,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['foundation', 'engine', 'carry'],
    loadLevel: 'light',
    impactLevel: 'low',
    hyroxStationsUsed: ['SkiErg', 'Farmers Carry'],
    progressionLevel: 1,
    structure: [
      block('b1', 'Primer', 8, 'Easy movement, breathing, and SkiErg ramp.'),
      block('b2', 'Main set', 20, '4 x 3 min SkiErg / 1 min easy walk; 3 x 40m farmers carry.', ['SkiErg', 'Farmers Carry']),
      block('b3', 'Finish', 14, 'Controlled carry hold and trunk brace under fatigue.', ['Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'foundation-02',
    phaseType: 'foundation',
    sessionType: 'hyrox_functional',
    durationMinutes: 45,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['foundation', 'sleds', 'technique'],
    loadLevel: 'light',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull'],
    progressionLevel: 1,
    structure: [
      block('b1', 'Primer', 8, 'Sled patterning and hip hinge prep.'),
      block('b2', 'Skill set', 18, '6 x 15m sled push / pull at smooth pace.', ['Sled Push', 'Sled Pull']),
      block('b3', 'Main set', 19, '3 x 2 min sled push + 2 x 2 min sled pull with full recovery.', ['Sled Push', 'Sled Pull']),
    ],
  }),
  workout({
    workoutId: 'foundation-03',
    phaseType: 'foundation',
    sessionType: 'hyrox_functional',
    durationMinutes: 44,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['foundation', 'engine', 'wall_ball'],
    loadLevel: 'light',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Row', 'Wall Ball'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Row warm-up with squat-to-press mechanics.'),
      block('b2', 'Main set', 20, '5 x 500m row / 10 wall balls between rounds.', ['Row', 'Wall Ball']),
      block('b3', 'Finish', 16, '2 x 8 min steady row-to-wall-ball flow.', ['Row', 'Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'foundation-04',
    phaseType: 'foundation',
    sessionType: 'hyrox_functional',
    durationMinutes: 46,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['foundation', 'burpee', 'lunge'],
    loadLevel: 'light',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Burpee Broad Jump', 'Sandbag Lunges'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Low-amplitude hops and hip mobility.'),
      block('b2', 'Main set', 20, '4 rounds: 8 burpee broad jumps + 12 sandbag lunges.', ['Burpee Broad Jump', 'Sandbag Lunges']),
      block('b3', 'Finish', 18, '3 x 2 min burpee-to-lunge density block.', ['Burpee Broad Jump', 'Sandbag Lunges']),
    ],
  }),
  workout({
    workoutId: 'foundation-05',
    phaseType: 'foundation',
    sessionType: 'hyrox_functional',
    durationMinutes: 48,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['foundation', 'mixed', 'transition'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Farmers Carry'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Easy engine work and bracing.'),
      block('b2', 'Main set', 16, '3 rounds: 500m SkiErg + 500m row + 40m farmers carry.', ['SkiErg', 'Row', 'Farmers Carry']),
      block('b3', 'Control set', 24, '2 x 6 min mixed station flow with smooth transits.', ['SkiErg', 'Row', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'foundation-06',
    phaseType: 'foundation',
    sessionType: 'hyrox_simulation',
    durationMinutes: 47,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['foundation', 'sleds', 'wall_ball'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Sled Push', 'Wall Ball', 'Farmers Carry'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Sled patterning, squat bracing, and shoulder prep.'),
      block('b2', 'Main set', 18, '4 rounds: 10 wall balls + 20m sled push + 20m farmers carry.', ['Sled Push', 'Wall Ball', 'Farmers Carry']),
      block('b3', 'Finish', 21, '2 x 8 min density block with sled push into wall ball.', ['Sled Push', 'Wall Ball']),
    ],
  }),
];

const BASE_WORKOUTS = [
  workout({
    workoutId: 'base-01',
    phaseType: 'base',
    sessionType: 'hyrox_functional',
    durationMinutes: 50,
    intensity: 'moderate',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['base', 'engine', 'intervals'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Engine ramp with cadence changes.'),
      block('b2', 'Intervals', 18, '5 x 500m SkiErg / 500m row with controlled turnover.', ['SkiErg', 'Row']),
      block('b3', 'Finish', 24, '2 x 8 min alternating SkiErg and row at steady pressure.', ['SkiErg', 'Row']),
    ],
  }),
  workout({
    workoutId: 'base-02',
    phaseType: 'base',
    sessionType: 'hyrox_functional',
    durationMinutes: 52,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['base', 'sleds', 'carry'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Farmers Carry'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Sled build and carry bracing.'),
      block('b2', 'Main set', 18, '3 rounds: 20m sled push + 20m sled pull + 40m farmers carry.', ['Sled Push', 'Sled Pull', 'Farmers Carry']),
      block('b3', 'Finish', 26, '2 x 10 min sled-to-carry ladder with shorter rest.', ['Sled Push', 'Sled Pull', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'base-03',
    phaseType: 'base',
    sessionType: 'hyrox_simulation',
    durationMinutes: 53,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['base', 'threshold', 'stations'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Burpee Broad Jump'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Threshold build and jump mechanics.'),
      block('b2', 'Main set', 20, '4 rounds: 600m run + 15m sled push + 6 burpee broad jumps.', ['Sled Push', 'Burpee Broad Jump']),
      block('b3', 'Finish', 25, '2 x 8 min sled pull and burpee density block.', ['Sled Pull', 'Burpee Broad Jump']),
    ],
  }),
  workout({
    workoutId: 'base-04',
    phaseType: 'base',
    sessionType: 'hyrox_functional',
    durationMinutes: 54,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['base', 'lunges', 'wall_ball', 'engine'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Row', 'Sandbag Lunges', 'Wall Ball'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Row and squat prep.'),
      block('b2', 'Main set', 18, '4 rounds: 500m row + 12 sandbag lunges + 10 wall balls.', ['Row', 'Sandbag Lunges', 'Wall Ball']),
      block('b3', 'Finish', 28, '2 x 9 min alternating row and wall ball with lunge insertions.', ['Row', 'Sandbag Lunges', 'Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'base-05',
    phaseType: 'base',
    sessionType: 'hyrox_functional',
    durationMinutes: 55,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['base', 'carry', 'pull'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Farmers Carry', 'Sled Pull'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Grip, hinge, and trunk prep.'),
      block('b2', 'Main set', 20, '5 rounds: 40m farmers carry + 12m sled pull.', ['Farmers Carry', 'Sled Pull']),
      block('b3', 'Finish', 27, '2 x 8 min carry-to-pull ladder with short recoveries.', ['Farmers Carry', 'Sled Pull']),
    ],
  }),
  workout({
    workoutId: 'base-06',
    phaseType: 'base',
    sessionType: 'hyrox_simulation',
    durationMinutes: 56,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['base', 'engine', 'burpee'],
    loadLevel: 'moderate',
    impactLevel: 'high',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Burpee Broad Jump'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Engine rise with jump prep.'),
      block('b2', 'Main set', 18, '3 rounds: 750m SkiErg + 500m row + 8 burpee broad jumps.', ['SkiErg', 'Row', 'Burpee Broad Jump']),
      block('b3', 'Finish', 30, '2 x 10 min mixed engine and burpee density.', ['SkiErg', 'Row', 'Burpee Broad Jump']),
    ],
  }),
  workout({
    workoutId: 'base-07',
    phaseType: 'base',
    sessionType: 'hyrox_simulation',
    durationMinutes: 58,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['base', 'wall_ball', 'run', 'fatigue'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Wall Ball', 'Sandbag Lunges', 'Sled Push'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 10, 'Run preparation and squat/press activation.'),
      block('b2', 'Race block', 20, '4 rounds: 600m run + 12 wall balls + 10 sandbag lunges.', ['Wall Ball', 'Sandbag Lunges']),
      block('b3', 'Finish', 28, '2 x 10 min simulation block with a sled push insertion.', ['Sled Push', 'Wall Ball', 'Sandbag Lunges']),
    ],
  }),
  workout({
    workoutId: 'base-08',
    phaseType: 'base',
    sessionType: 'hyrox_functional',
    durationMinutes: 57,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['base', 'mixed', 'station_combo'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Sled Push', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Brace, hinge, and squat prep.'),
      block('b2', 'Main set', 18, '4 rounds: 15m sled push + 20m farmers carry + 8 lunges + 8 wall balls.', ['Sled Push', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball']),
      block('b3', 'Finish', 31, '2 x 10 min mixed station flow with reduced rest.', ['Sled Push', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball']),
    ],
  }),
];

const BUILD_WORKOUTS = [
  workout({
    workoutId: 'build-01',
    phaseType: 'build',
    sessionType: 'hyrox_functional',
    durationMinutes: 58,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['build', 'engine', 'stations'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Farmers Carry', 'Wall Ball'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Raise output and sharpen transitions.'),
      block('b2', 'Main set', 20, '4 rounds: 500m SkiErg + 500m row + 30m carry + 10 wall balls.', ['SkiErg', 'Row', 'Farmers Carry', 'Wall Ball']),
      block('b3', 'Finish', 30, '2 x 10 min mixed engine density at build pace.', ['SkiErg', 'Row', 'Farmers Carry', 'Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'build-02',
    phaseType: 'build',
    sessionType: 'hyrox_simulation',
    durationMinutes: 60,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['build', 'sim', 'sleds'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Burpee Broad Jump'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and sled rhythm.'),
      block('b2', 'Simulation block', 22, '3 rounds: 500m run + 20m sled push + 20m sled pull.', ['Sled Push', 'Sled Pull']),
      block('b3', 'Finish', 28, '2 x 10 min burpee and sled density with shorter transitions.', ['Sled Push', 'Sled Pull', 'Burpee Broad Jump']),
    ],
  }),
  workout({
    workoutId: 'build-03',
    phaseType: 'build',
    sessionType: 'hyrox_functional',
    durationMinutes: 61,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['build', 'carry', 'lunge'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Grip, gait, and squat prep.'),
      block('b2', 'Main set', 20, '4 rounds: 40m carry + 16 sandbag lunges + 12 wall balls.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball']),
      block('b3', 'Finish', 33, '2 x 11 min carry/lunge/wall-ball flow.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'build-04',
    phaseType: 'build',
    sessionType: 'hyrox_simulation',
    durationMinutes: 62,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['build', 'wall_ball', 'threshold'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Row', 'Wall Ball', 'Burpee Broad Jump'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Run prep and squat-to-press rhythm.'),
      block('b2', 'Main set', 22, '3 rounds: 800m run + 600m row + 15 wall balls.', ['Row', 'Wall Ball']),
      block('b3', 'Finish', 30, '2 x 10 min burpee, row, and wall-ball blend.', ['Row', 'Wall Ball', 'Burpee Broad Jump']),
    ],
  }),
  workout({
    workoutId: 'build-05',
    phaseType: 'build',
    sessionType: 'hyrox_functional',
    durationMinutes: 63,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['build', 'engine', 'sleds'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Sled Push', 'Sled Pull', 'Farmers Carry'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Engine ramp with sled tracking.'),
      block('b2', 'Main set', 22, '4 rounds: 500m SkiErg + 15m sled push + 15m sled pull + 20m carry.', ['SkiErg', 'Sled Push', 'Sled Pull', 'Farmers Carry']),
      block('b3', 'Finish', 33, '2 x 11 min blended station block with shorter rests.', ['SkiErg', 'Sled Push', 'Sled Pull', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'build-06',
    phaseType: 'build',
    sessionType: 'hyrox_simulation',
    durationMinutes: 64,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['build', 'simulation', 'run'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Sled Push', 'Burpee Broad Jump'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race preparation and transition pacing.'),
      block('b2', 'Simulation block', 22, '2 rounds: 1 km run + 500m SkiErg + 500m row.', ['SkiErg', 'Row']),
      block('b3', 'Finish', 32, '3 rounds: 400m run + 15m sled push + 6 burpee broad jumps.', ['Sled Push', 'Burpee Broad Jump']),
    ],
  }),
  workout({
    workoutId: 'build-07',
    phaseType: 'build',
    sessionType: 'hyrox_functional',
    durationMinutes: 65,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['build', 'wall_ball', 'carry'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball', 'Sled Pull'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Lower-body and grip prep.'),
      block('b2', 'Main set', 22, '4 rounds: 30m carry + 12 lunges + 12 wall balls + 10m sled pull.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball', 'Sled Pull']),
      block('b3', 'Finish', 35, '2 x 12 min blended station flow with short recoveries.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball', 'Sled Pull']),
    ],
  }),
  workout({
    workoutId: 'build-08',
    phaseType: 'build',
    sessionType: 'hyrox_simulation',
    durationMinutes: 66,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['build', 'simulation', 'full_mix'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['SkiErg', 'Sled Push', 'Row', 'Burpee Broad Jump', 'Farmers Carry'],
    progressionLevel: 5,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and turnover work.'),
      block('b2', 'Main set', 24, '3 rounds: 800m run + 500m SkiErg + 15m sled push + 500m row.', ['SkiErg', 'Sled Push', 'Row']),
      block('b3', 'Simulation finish', 32, '2 rounds: 400m run + 6 burpee broad jumps + 20m carry.', ['Burpee Broad Jump', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'build-09',
    phaseType: 'build',
    sessionType: 'hyrox_functional',
    durationMinutes: 67,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['build', 'intervals', 'wall_ball'],
    loadLevel: 'heavy',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Row', 'Wall Ball', 'Sandbag Lunges'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Squat pattern and engine ramp.'),
      block('b2', 'Main set', 24, '5 rounds: 600m row + 12 wall balls + 10 sandbag lunges.', ['Row', 'Wall Ball', 'Sandbag Lunges']),
      block('b3', 'Finish', 35, '2 x 12 min wall-ball and lunge tolerance block.', ['Wall Ball', 'Sandbag Lunges']),
    ],
  }),
  workout({
    workoutId: 'build-10',
    phaseType: 'build',
    sessionType: 'hyrox_simulation',
    durationMinutes: 68,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['build', 'simulation', 'station_combo'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Farmers Carry', 'Wall Ball'],
    progressionLevel: 5,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and transition rehearsal.'),
      block('b2', 'Main set', 24, '3 rounds: 800m run + 20m sled push + 20m sled pull.', ['Sled Push', 'Sled Pull']),
      block('b3', 'Simulation finish', 34, '3 rounds: 20m carry + 12 wall balls with reduced rest.', ['Farmers Carry', 'Wall Ball']),
    ],
  }),
];

const PEAK_WORKOUTS = [
  workout({
    workoutId: 'peak-01',
    phaseType: 'peak',
    sessionType: 'hyrox_simulation',
    durationMinutes: 54,
    intensity: 'race',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['peak', 'simulation', 'race_specific'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['SkiErg', 'Sled Push', 'Row'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race pace rehearsal and breathing control.'),
      block('b2', 'Main set', 18, '3 rounds: 600m run + 500m SkiErg + 15m sled push.', ['SkiErg', 'Sled Push']),
      block('b3', 'Finish', 26, '2 x 10 min station blend with row emphasis.', ['Row', 'SkiErg']),
    ],
  }),
  workout({
    workoutId: 'peak-02',
    phaseType: 'peak',
    sessionType: 'hyrox_simulation',
    durationMinutes: 56,
    intensity: 'race',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['peak', 'simulation', 'pull'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Pull', 'Burpee Broad Jump', 'Farmers Carry'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and pull mechanics.'),
      block('b2', 'Main set', 18, '3 rounds: 500m run + 15m sled pull + 6 burpee broad jumps.', ['Sled Pull', 'Burpee Broad Jump']),
      block('b3', 'Finish', 28, '2 x 10 min pull-to-carry race rhythm.', ['Sled Pull', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'peak-03',
    phaseType: 'peak',
    sessionType: 'hyrox_functional',
    durationMinutes: 57,
    intensity: 'race',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['peak', 'simulation', 'wall_ball'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Row', 'Wall Ball', 'Sandbag Lunges'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and squat/press patterning.'),
      block('b2', 'Main set', 18, '3 rounds: 600m row + 15 wall balls + 10 sandbag lunges.', ['Row', 'Wall Ball', 'Sandbag Lunges']),
      block('b3', 'Finish', 29, '2 x 10 min wall-ball finish with lunge insertions.', ['Wall Ball', 'Sandbag Lunges']),
    ],
  }),
  workout({
    workoutId: 'peak-04',
    phaseType: 'peak',
    sessionType: 'hyrox_functional',
    durationMinutes: 49,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['peak', 'sharpener', 'carry'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Farmers Carry', 'Sled Push'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 8, 'Short sharpener with low fatigue.'),
      block('b2', 'Main set', 16, '4 rounds: 400m SkiErg + 30m farmers carry + 10m sled push.', ['SkiErg', 'Farmers Carry', 'Sled Push']),
      block('b3', 'Finish', 25, '2 x 8 min transition practice at race pace.', ['SkiErg', 'Farmers Carry']),
    ],
  }),
  workout({
    workoutId: 'peak-05',
    phaseType: 'peak',
    sessionType: 'hyrox_simulation',
    durationMinutes: 58,
    intensity: 'race',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['peak', 'simulation', 'full_mix'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['SkiErg', 'Sled Pull', 'Row', 'Wall Ball'],
    progressionLevel: 5,
    structure: [
      block('b1', 'Primer', 10, 'Race rehearsal and transition control.'),
      block('b2', 'Main set', 20, '3 rounds: 800m run + 500m SkiErg + 500m row.', ['SkiErg', 'Row']),
      block('b3', 'Finish', 28, '3 rounds: 12m sled pull + 10 wall balls at race rhythm.', ['Sled Pull', 'Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'peak-06',
    phaseType: 'peak',
    sessionType: 'hyrox_functional',
    durationMinutes: 59,
    intensity: 'race',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['peak', 'simulation', 'station_combo'],
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Push', 'Burpee Broad Jump', 'Farmers Carry', 'Sandbag Lunges'],
    progressionLevel: 5,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and lower-body activation.'),
      block('b2', 'Main set', 20, '3 rounds: 500m run + 15m sled push + 6 burpee broad jumps.', ['Sled Push', 'Burpee Broad Jump']),
      block('b3', 'Finish', 29, '3 rounds: 20m carry + 8 sandbag lunges at race rhythm.', ['Farmers Carry', 'Sandbag Lunges']),
    ],
  }),
];

export const HYROX_WORKOUT_LIBRARY = {
  foundation: FOUNDATION_WORKOUTS,
  base: BASE_WORKOUTS,
  build: BUILD_WORKOUTS,
  peak: PEAK_WORKOUTS,
};

export const HYROX_WORKOUT_COUNTS = Object.fromEntries(
  Object.entries(HYROX_WORKOUT_LIBRARY).map(([phaseType, workouts]) => [phaseType, workouts.length]),
);

export const HYROX_WORKOUTS = Object.values(HYROX_WORKOUT_LIBRARY).flat();

export const HYROX_LIBRARY_PHASE_TYPES = Object.freeze(Object.keys(PHASE_LABELS));
export const HYROX_LIBRARY_SESSION_TYPES = Object.freeze(['hyrox_functional', 'hyrox_simulation', 'functional', 'simulation']);
export const HYROX_LIBRARY_INTENSITIES = Object.freeze(['easy', 'moderate', 'hard', 'race']);
export const HYROX_LIBRARY_REQUIRED_FIELDS = Object.freeze([
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
]);

export function auditHyroxWorkoutLibrary(library = HYROX_WORKOUT_LIBRARY) {
  const issues = [];
  const seenIds = new Set();
  const seenIdsByPhase = new Map();

  for (const [phaseType, workouts] of Object.entries(library)) {
    if (!HYROX_LIBRARY_PHASE_TYPES.includes(phaseType)) {
      issues.push(`Unknown phaseType: ${phaseType}`);
      continue;
    }

    if (!Array.isArray(workouts)) {
      issues.push(`Invalid workout bucket for phaseType: ${phaseType}`);
      continue;
    }

    seenIdsByPhase.set(phaseType, workouts.length);

    for (const workoutItem of workouts) {
      for (const field of HYROX_LIBRARY_REQUIRED_FIELDS) {
        if (!(field in workoutItem) || workoutItem[field] == null) {
          issues.push(`Missing required field "${field}" on ${workoutItem.workoutId || '(unknown workout)'}`);
        }
      }

      if (seenIds.has(workoutItem.workoutId)) {
        issues.push(`Duplicate workoutId: ${workoutItem.workoutId}`);
      }
      seenIds.add(workoutItem.workoutId);

      if (workoutItem.programType !== 'hyrox') {
        issues.push(`Invalid programType on ${workoutItem.workoutId}`);
      }
      if (workoutItem.phaseType !== phaseType) {
        issues.push(`phaseType mismatch on ${workoutItem.workoutId}`);
      }
      if (!HYROX_LIBRARY_SESSION_TYPES.includes(workoutItem.sessionType) || !isCompatibleHyroxSessionType(workoutItem.sessionType)) {
        issues.push(`Invalid sessionType on ${workoutItem.workoutId}`);
      }
      if (!HYROX_CANONICAL_SESSION_TYPES.includes(workoutItem.sessionTypeCanonical)) {
        issues.push(`Invalid canonical sessionType on ${workoutItem.workoutId}`);
      }
      if (!HYROX_LEGACY_SESSION_TYPES.includes(workoutItem.sessionTypeLegacy)) {
        issues.push(`Invalid legacy sessionType on ${workoutItem.workoutId}`);
      }
      if (!HYROX_LIBRARY_INTENSITIES.includes(workoutItem.intensity)) {
        issues.push(`Invalid intensity on ${workoutItem.workoutId}`);
      }
      if (!HYROX_WARMUP_TEMPLATES[workoutItem.warmupTemplateId]) {
        issues.push(`Missing warmup template on ${workoutItem.workoutId}`);
      }
      if (!HYROX_COOLDOWN_TEMPLATES[workoutItem.cooldownTemplateId]) {
        issues.push(`Missing cooldown template on ${workoutItem.workoutId}`);
      }
      if (HYROX_WARMUP_TEMPLATES[workoutItem.warmupTemplateId]?.sessionType !== workoutItem.sessionType) {
        issues.push(`Warmup sessionType mismatch on ${workoutItem.workoutId}`);
      }
      if (HYROX_COOLDOWN_TEMPLATES[workoutItem.cooldownTemplateId]?.sessionType !== workoutItem.sessionType) {
        issues.push(`Cooldown sessionType mismatch on ${workoutItem.workoutId}`);
      }
      if (!Array.isArray(workoutItem.hyroxStationsUsed) || workoutItem.hyroxStationsUsed.some(station => !ALL_STATIONS.includes(station))) {
        issues.push(`Invalid hyroxStationsUsed on ${workoutItem.workoutId}`);
      }
      if (!Array.isArray(workoutItem.structure) || workoutItem.structure.length === 0) {
        issues.push(`Missing structure on ${workoutItem.workoutId}`);
      }
      if (typeof workoutItem.shortVersionRule !== 'string' || workoutItem.shortVersionRule.length === 0) {
        issues.push(`Missing shortVersionRule on ${workoutItem.workoutId}`);
      }
      if (mapSchedulePhaseToLibraryPhase(workoutItem.schedulePhaseType || workoutItem.phaseType) !== workoutItem.phaseType) {
        issues.push(`schedulePhaseType mismatch on ${workoutItem.workoutId}`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    counts: Object.fromEntries(seenIdsByPhase.entries()),
  };
}

export function validateHyroxWorkoutLibrary(library = HYROX_WORKOUT_LIBRARY) {
  return auditHyroxWorkoutLibrary(library);
}
