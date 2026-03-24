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
export const HYROX_SESSION_STRUCTURE_TYPES = Object.freeze(['straight_sets', 'superset', 'circuit', 'hybrid_strength', 'hyrox_style']);
export const HYROX_MOVEMENT_SPECIFICITY_TYPES = Object.freeze(['exact', 'analogous', 'fallback']);
export const HYROX_MOVEMENT_CATEGORIES = Object.freeze([
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
export const HYROX_EQUIPMENT_TYPES = Object.freeze([
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

function movementOption(movementId, displayName, equipmentType, tags = [], specificityType = 'analogous') {
  return { movementId, displayName, equipmentType, tags, specificityType };
}

function block(blockId, name, durationMinutes, details, stationsUsed = [], movementConfig = null) {
  return {
    blockId,
    name,
    durationMinutes,
    details,
    stationsUsed,
    ...(movementConfig ? { ...movementConfig } : {}),
  };
}

function normalizeSubstitutionsByProfile(profileSubstitutions) {
  return Object.fromEntries(
    Object.entries(profileSubstitutions).map(([movementId, value]) => {
      if (Array.isArray(value)) {
        return [movementId, { preferredAlternatives: [...value], requiredFallbacks: [] }];
      }
      return [movementId, {
        preferredAlternatives: [...(value?.preferredAlternatives || [])],
        requiredFallbacks: [...(value?.requiredFallbacks || [])],
      }];
    }),
  );
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
    sessionStructureType: definition.sessionStructureType || 'hyrox_style',
    structure: definition.structure.map((item) => ({
      ...item,
      stationsUsed: [...(item.stationsUsed || [])],
      targetDemands: [...(item.targetDemands || [])],
      equipmentRequired: [...(item.equipmentRequired || [])],
      preferenceTags: [...(item.preferenceTags || [])],
      movementOptions: item.movementOptions
        ? item.movementOptions.map(option => ({
          ...option,
          tags: [...(option.tags || [])],
          preferenceTags: [...(option.preferenceTags || [])],
        }))
        : undefined,
      pairedMovements: item.pairedMovements
        ? item.pairedMovements.map(pair => ({
          ...pair,
          pairTags: [...(pair.pairTags || [])],
          movementA: pair.movementA ? { ...pair.movementA } : null,
          movementB: pair.movementB ? { ...pair.movementB } : null,
        }))
        : undefined,
    })),
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
  full_gym: normalizeSubstitutionsByProfile({
    'SkiErg': ['Row 1000m', 'Assault bike 45 calories'],
    'Sled Push': ['Heavy prowler push', 'Plate-loaded turf push'],
    'Sled Pull': ['Rope sled drag', 'Cable drag walk'],
    'Burpee Broad Jump': ['Burpee to target', 'Burpee + tuck jump'],
    'Row': ['SkiErg 1000m', 'Assault bike 45 calories'],
    'Farmers Carry': ['Heavy kettlebell carry', 'Trap bar carry'],
    'Sandbag Lunges': ['Front rack lunge', 'Goblet walking lunge'],
    'Wall Ball': ['Dumbbell thruster', 'Med ball squat throw'],
  }),
  limited_gym: normalizeSubstitutionsByProfile({
    'SkiErg': ['Row 1000m', 'Incline treadmill run 8 min'],
    'Sled Push': ['Treadmill push-off drive', 'Heavy walking lunge march'],
    'Sled Pull': ['Band row march', 'Backward treadmill walk'],
    'Burpee Broad Jump': ['Burpee step-up', 'Squat thrust broad step'],
    'Row': ['Fast run 800m', 'High-knee interval 2 min'],
    'Farmers Carry': ['Dumbbell suitcase carry', 'Front rack plate carry'],
    'Sandbag Lunges': ['Reverse lunges', 'Split squat tempo reps'],
    'Wall Ball': ['DB thruster', 'Air squat to reach'],
  }),
  bodyweight: normalizeSubstitutionsByProfile({
    'SkiErg': ['High knees', 'Mountain climbers'],
    'Sled Push': ['Wall drive march', 'Hill sprint'],
    'Sled Pull': ['Bear crawl drag', 'Prone towel row isometric'],
    'Burpee Broad Jump': ['Squat thrusts', 'Plank walkout jumps'],
    'Row': ['Shadow boxing intervals', 'Quick-feet intervals'],
    'Farmers Carry': ['Backpack bear hug march', 'March in place with brace'],
    'Sandbag Lunges': ['Walking lunges', 'Split squat isometric holds'],
    'Wall Ball': ['Tempo air squats', 'Squat to overhead reach'],
  }),
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
    sessionStructureType: 'hybrid_strength',
    loadLevel: 'light',
    impactLevel: 'low',
    hyroxStationsUsed: ['SkiErg', 'Farmers Carry'],
    progressionLevel: 1,
    structure: [
      block('b1', 'Primer', 8, 'Easy movement, breathing, and SkiErg ramp.'),
      block('b2', 'Main set', 20, '4 x 3 min SkiErg / 1 min easy walk; 3 x 40m farmers carry.', ['SkiErg', 'Farmers Carry'], {
        movementCategory: 'engine_machine',
        targetDemands: ['aerobic_power', 'station_transition'],
        equipmentRequired: ['ski_erg', 'rower', 'bike'],
        preferenceTags: ['engine'],
        movementOptions: [
          movementOption('SkiErg', 'SkiErg', 'ski_erg', ['hyrox_station', 'machine'], 'exact'),
          movementOption('Row', 'Row', 'rower', ['hyrox_station', 'machine'], 'analogous'),
          movementOption('Bike Erg', 'Bike Erg', 'bike', ['machine'], 'fallback'),
        ],
        defaultMovementId: 'SkiErg',
      }),
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
    sessionStructureType: 'superset',
    loadLevel: 'light',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Row', 'Wall Ball'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Row warm-up with squat-to-press mechanics.'),
      block('b2', 'Main set', 20, '5 x 500m row / 10 wall balls between rounds.', ['Row', 'Wall Ball'], {
        blockStructureType: 'superset',
        pairedMovements: [
          {
            pairId: 'A',
            pairTags: ['engine_to_station'],
            movementA: movementOption('Row', 'Row', 'rower', ['hyrox_station'], 'exact'),
            movementB: movementOption('Wall Ball', 'Wall Ball', 'wall_ball', ['hyrox_station'], 'exact'),
          },
        ],
        movementCategory: 'squat_press_endurance',
        targetDemands: ['repeat_power', 'squat_to_press'],
        equipmentRequired: ['rower', 'wall_ball'],
        preferenceTags: ['wall_ball', 'engine'],
        movementOptions: [
          movementOption('Wall Ball', 'Wall Ball', 'wall_ball', ['hyrox_station', 'squat', 'push'], 'exact'),
          movementOption('Dumbbell Thruster', 'Dumbbell Thruster', 'dumbbells', ['squat', 'push'], 'analogous'),
          movementOption('Med Ball Thruster', 'Med Ball Thruster', 'wall_ball', ['squat', 'push'], 'analogous'),
        ],
        defaultMovementId: 'Wall Ball',
      }),
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
    sessionStructureType: 'circuit',
    loadLevel: 'light',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['Burpee Broad Jump', 'Sandbag Lunges'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Low-amplitude hops and hip mobility.'),
      block('b2', 'Main set', 20, '4 rounds: 8 burpee broad jumps + 12 sandbag lunges.', ['Burpee Broad Jump', 'Sandbag Lunges'], {
        movementCategory: 'full_body_conditioning',
        targetDemands: ['locomotion_power', 'unilateral_endurance'],
        equipmentRequired: ['bodyweight', 'sandbag'],
        preferenceTags: ['conditioning', 'locomotion_power'],
        movementOptions: [
          movementOption('Burpee Broad Jump', 'Burpee Broad Jump', 'bodyweight', ['hyrox_station', 'locomotion'], 'exact'),
          movementOption('Burpee to Box', 'Burpee to Box', 'plyo_box', ['conditioning'], 'analogous'),
          movementOption('Sprawl Jump', 'Sprawl Jump', 'bodyweight', ['conditioning'], 'fallback'),
        ],
        defaultMovementId: 'Burpee Broad Jump',
      }),
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
    sessionStructureType: 'hybrid_strength',
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Farmers Carry'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Easy engine work and bracing.'),
      block('b2', 'Main set', 16, '3 rounds: 500m SkiErg + 500m row + 40m farmers carry.', ['SkiErg', 'Row', 'Farmers Carry']),
      block('b3', 'Control set', 24, '2 x 6 min mixed station flow with smooth transits.', ['SkiErg', 'Row', 'Farmers Carry'], {
        movementCategory: 'carry',
        targetDemands: ['grip_endurance', 'trunk_stability'],
        equipmentRequired: ['farmer_carry_handles', 'dumbbells', 'kettlebells'],
        preferenceTags: ['carry'],
        movementOptions: [
          movementOption('Farmers Carry', 'Farmers Carry', 'farmer_carry_handles', ['hyrox_station'], 'exact'),
          movementOption('Suitcase Carry', 'Suitcase Carry', 'dumbbells', ['carry'], 'analogous'),
          movementOption('Front Rack Carry', 'Front Rack Carry', 'kettlebells', ['carry'], 'analogous'),
          movementOption('Trap Bar Carry', 'Trap Bar Carry', 'barbell', ['carry'], 'fallback'),
        ],
        defaultMovementId: 'Farmers Carry',
      }),
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
    sessionStructureType: 'hybrid_strength',
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row'],
    progressionLevel: 2,
    structure: [
      block('b1', 'Primer', 8, 'Engine ramp with cadence changes.'),
      block('b2', 'Intervals', 18, '5 x 500m SkiErg / 500m row with controlled turnover.', ['SkiErg', 'Row'], {
        movementCategory: 'engine_machine',
        targetDemands: ['aerobic_power', 'threshold'],
        equipmentRequired: ['ski_erg', 'rower', 'bike'],
        preferenceTags: ['engine'],
        movementOptions: [
          movementOption('SkiErg', 'SkiErg', 'ski_erg', ['hyrox_station'], 'exact'),
          movementOption('Row', 'Row', 'rower', ['hyrox_station'], 'exact'),
          movementOption('Bike Erg', 'Bike Erg', 'bike', ['machine'], 'analogous'),
        ],
        defaultMovementId: 'SkiErg',
      }),
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
      block('b2', 'Main set', 18, '4 rounds: 500m row + 12 sandbag lunges + 10 wall balls.', ['Row', 'Sandbag Lunges', 'Wall Ball'], {
        movementCategory: 'lunge_pattern',
        targetDemands: ['unilateral_strength', 'hip_stability'],
        equipmentRequired: ['sandbag', 'barbell', 'dumbbells', 'smith_machine'],
        preferenceTags: ['lunges'],
        movementOptions: [
          movementOption('Sandbag Lunges', 'Sandbag Walking Lunge', 'sandbag', ['hyrox_station', 'unilateral'], 'exact'),
          movementOption('Walking Lunge', 'Walking Lunge', 'bodyweight', ['unilateral'], 'analogous'),
          movementOption('Reverse Lunge', 'Reverse Lunge', 'bodyweight', ['unilateral'], 'analogous'),
          movementOption('Split Squat', 'Split Squat', 'dumbbells', ['unilateral'], 'analogous'),
          movementOption('Smith Split Squat', 'Smith Split Squat', 'smith_machine', ['unilateral'], 'fallback'),
          movementOption('Step Back Lunge', 'Step Back Lunge', 'bodyweight', ['unilateral'], 'fallback'),
        ],
        defaultMovementId: 'Sandbag Lunges',
      }),
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
      block('b2', 'Race block', 20, '4 rounds: 600m run + 12 wall balls + 10 sandbag lunges.', ['Wall Ball', 'Sandbag Lunges'], {
        movementCategory: 'squat_press_endurance',
        targetDemands: ['squat_press_repeatability'],
        equipmentRequired: ['wall_ball', 'dumbbells', 'barbell'],
        preferenceTags: ['wall_ball'],
        movementOptions: [
          movementOption('Wall Ball', 'Wall Ball', 'wall_ball', ['hyrox_station', 'squat', 'push'], 'exact'),
          movementOption('Thruster', 'Barbell Thruster', 'barbell', ['squat', 'push'], 'analogous'),
          movementOption('Dumbbell Thruster', 'Dumbbell Thruster', 'dumbbells', ['squat', 'push'], 'analogous'),
          movementOption('Med Ball Thruster', 'Med Ball Thruster', 'wall_ball', ['squat', 'push'], 'fallback'),
        ],
        defaultMovementId: 'Wall Ball',
      }),
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
      block('b2', 'Main set', 18, '4 rounds: 15m sled push + 20m farmers carry + 8 lunges + 8 wall balls.', ['Sled Push', 'Farmers Carry', 'Sandbag Lunges', 'Wall Ball'], {
        movementCategory: 'squat_pattern',
        targetDemands: ['force_production'],
        equipmentRequired: ['barbell', 'hack_squat_machine', 'smith_machine', 'dumbbells', 'leg_press'],
        preferenceTags: ['strength'],
        movementOptions: [
          movementOption('Back Squat', 'Back Squat', 'barbell', ['strength'], 'exact'),
          movementOption('Front Squat', 'Front Squat', 'barbell', ['strength'], 'analogous'),
          movementOption('Hack Squat', 'Hack Squat', 'hack_squat_machine', ['strength'], 'analogous'),
          movementOption('Smith Squat', 'Smith Squat', 'smith_machine', ['strength'], 'analogous'),
          movementOption('Belt Squat', 'Belt Squat', 'plate_loaded_machines', ['strength'], 'fallback'),
          movementOption('Goblet Squat', 'Goblet Squat', 'dumbbells', ['strength'], 'fallback'),
        ],
        defaultMovementId: 'Back Squat',
      }),
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
    sessionStructureType: 'superset',
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Row', 'Farmers Carry', 'Wall Ball'],
    progressionLevel: 3,
    structure: [
      block('b1', 'Primer', 8, 'Raise output and sharpen transitions.'),
      block('b2', 'Main set', 20, '4 rounds: 500m SkiErg + 500m row + 30m carry + 10 wall balls.', ['SkiErg', 'Row', 'Farmers Carry', 'Wall Ball'], {
        blockStructureType: 'superset',
        pairedMovements: [
          {
            pairId: 'A',
            pairTags: ['push_pull_balance'],
            movementA: movementOption('Dumbbell Press', 'Dumbbell Press', 'dumbbells', ['upper_push'], 'analogous'),
            movementB: movementOption('Cable Row', 'Cable Row', 'cable_machine', ['upper_pull'], 'analogous'),
          },
        ],
        movementCategory: 'horizontal_push',
        targetDemands: ['upper_body_endurance'],
        equipmentRequired: ['dumbbells', 'cable_machine', 'selectorized_machines'],
        preferenceTags: ['upper_push_pull'],
        movementOptions: [
          movementOption('Bench Press', 'Bench Press', 'barbell', ['upper_push'], 'exact'),
          movementOption('Dumbbell Press', 'Dumbbell Press', 'dumbbells', ['upper_push'], 'analogous'),
          movementOption('Smith Bench Press', 'Smith Bench Press', 'smith_machine', ['upper_push'], 'analogous'),
          movementOption('Push Up', 'Push Up', 'bodyweight', ['upper_push'], 'fallback'),
          movementOption('Machine Chest Press', 'Machine Chest Press', 'selectorized_machines', ['upper_push'], 'fallback'),
        ],
        defaultMovementId: 'Bench Press',
      }),
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
      block('b2', 'Simulation block', 22, '3 rounds: 500m run + 20m sled push + 20m sled pull.', ['Sled Push', 'Sled Pull'], {
        movementCategory: 'squat_pattern',
        targetDemands: ['horizontal_force'],
        equipmentRequired: ['sled_push', 'plate_loaded_machines', 'dumbbells'],
        preferenceTags: ['sled_push'],
        movementOptions: [
          movementOption('Sled Push', 'Sled Push', 'sled_push', ['hyrox_station'], 'exact'),
          movementOption('Prowler Push', 'Prowler Push', 'plate_loaded_machines', ['strength'], 'analogous'),
          movementOption('Heavy Walking Lunge March', 'Heavy Walking Lunge March', 'dumbbells', ['strength', 'lunge'], 'fallback'),
        ],
        defaultMovementId: 'Sled Push',
      }),
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
      block('b2', 'Main set', 20, '4 rounds: 40m carry + 16 sandbag lunges + 12 wall balls.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball'], {
        movementCategory: 'lunge_pattern',
        targetDemands: ['unilateral_strength'],
        equipmentRequired: ['sandbag', 'barbell', 'bodyweight'],
        preferenceTags: ['lunge'],
        movementOptions: [
          movementOption('Sandbag Lunges', 'Sandbag Walking Lunge', 'sandbag', ['hyrox_station', 'unilateral'], 'exact'),
          movementOption('Walking Lunge', 'Walking Lunge', 'bodyweight', ['unilateral'], 'analogous'),
          movementOption('Reverse Lunge', 'Reverse Lunge', 'bodyweight', ['unilateral'], 'analogous'),
          movementOption('Front Rack Lunge', 'Front Rack Lunge', 'barbell', ['strength'], 'analogous'),
          movementOption('Step Back Lunge', 'Step Back Lunge', 'bodyweight', ['unilateral'], 'fallback'),
        ],
        defaultMovementId: 'Sandbag Lunges',
      }),
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
      block('b2', 'Main set', 22, '3 rounds: 800m run + 600m row + 15 wall balls.', ['Row', 'Wall Ball'], {
        movementCategory: 'squat_press_endurance',
        targetDemands: ['squat_press_repeatability'],
        equipmentRequired: ['wall_ball', 'dumbbells'],
        preferenceTags: ['wall_ball'],
        movementOptions: [
          movementOption('Wall Ball', 'Wall Ball', 'wall_ball', ['hyrox_station', 'squat', 'push'], 'exact'),
          movementOption('Thruster', 'Thruster', 'barbell', ['squat', 'push'], 'analogous'),
          movementOption('Dumbbell Thruster', 'Dumbbell Thruster', 'dumbbells', ['squat', 'push'], 'analogous'),
          movementOption('Med Ball Thruster', 'Med Ball Thruster', 'wall_ball', ['power'], 'fallback'),
        ],
        defaultMovementId: 'Wall Ball',
      }),
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
      block('b2', 'Main set', 22, '4 rounds: 30m carry + 12 lunges + 12 wall balls + 10m sled pull.', ['Farmers Carry', 'Sandbag Lunges', 'Wall Ball', 'Sled Pull'], {
        movementCategory: 'horizontal_pull',
        movementOptions: [
          { movementId: 'Sled Pull', displayName: 'Sled Pull', equipmentType: 'machine', tags: ['hyrox_station'] },
          { movementId: 'Rope Sled Drag', displayName: 'Rope Sled Drag', equipmentType: 'machine', tags: ['strength'] },
          { movementId: 'Cable Drag Walk', displayName: 'Cable Drag Walk', equipmentType: 'machine', tags: ['strength'] },
        ],
        defaultMovementId: 'Sled Pull',
      }),
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
    sessionStructureType: 'hybrid_strength',
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Row', 'Wall Ball', 'Sandbag Lunges'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and squat/press patterning.'),
      block('b2', 'Main set', 18, '3 rounds: 600m row + 15 wall balls + 10 sandbag lunges.', ['Row', 'Wall Ball', 'Sandbag Lunges'], {
        movementCategory: 'squat_press_endurance',
        targetDemands: ['race_specific_squat_press'],
        equipmentRequired: ['wall_ball', 'dumbbells', 'barbell'],
        preferenceTags: ['wall_ball'],
        movementOptions: [
          movementOption('Wall Ball', 'Wall Ball', 'wall_ball', ['hyrox_station', 'squat', 'push'], 'exact'),
          movementOption('Thruster', 'Barbell Thruster', 'barbell', ['squat', 'push'], 'analogous'),
          movementOption('Dumbbell Thruster', 'Dumbbell Thruster', 'dumbbells', ['squat', 'push'], 'analogous'),
          movementOption('Med Ball Thruster', 'Med Ball Thruster', 'wall_ball', ['squat', 'push'], 'fallback'),
        ],
        defaultMovementId: 'Wall Ball',
      }),
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
    sessionStructureType: 'superset',
    loadLevel: 'heavy',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Push', 'Burpee Broad Jump', 'Farmers Carry', 'Sandbag Lunges'],
    progressionLevel: 5,
    structure: [
      block('b1', 'Primer', 10, 'Race prep and lower-body activation.'),
      block('b2', 'Main set', 20, '3 rounds: 500m run + 15m sled push + 6 burpee broad jumps.', ['Sled Push', 'Burpee Broad Jump']),
      block('b3', 'Finish', 29, '3 rounds: 20m carry + 8 sandbag lunges at race rhythm.', ['Farmers Carry', 'Sandbag Lunges'], {
        movementCategory: 'lunge_pattern',
        targetDemands: ['unilateral_tolerance'],
        equipmentRequired: ['sandbag', 'barbell', 'bodyweight'],
        preferenceTags: ['lunge'],
        movementOptions: [
          movementOption('Sandbag Lunges', 'Sandbag Walking Lunge', 'sandbag', ['hyrox_station'], 'exact'),
          movementOption('Split Squat', 'Split Squat', 'bodyweight', ['unilateral'], 'analogous'),
          movementOption('Front Rack Lunge', 'Front Rack Lunge', 'barbell', ['strength'], 'analogous'),
          movementOption('Step Back Lunge', 'Step Back Lunge', 'bodyweight', ['unilateral'], 'fallback'),
        ],
        defaultMovementId: 'Sandbag Lunges',
      }),
    ],
  }),
  workout({
    workoutId: 'peak-07',
    phaseType: 'peak',
    sessionType: 'hyrox_functional',
    durationMinutes: 53,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_functional_warmup',
    cooldownTemplateId: 'hyrox_functional_cooldown',
    tags: ['peak', 'transition', 'efficiency'],
    loadLevel: 'moderate',
    impactLevel: 'moderate',
    hyroxStationsUsed: ['SkiErg', 'Farmers Carry', 'Wall Ball'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Stride build-ups and SkiErg pacing rehearsal.'),
      block('b2', 'Main set', 20, '4 rounds: 400m run + 500m SkiErg + 30m farmers carry.', ['SkiErg', 'Farmers Carry']),
      block('b3', 'Finish', 23, '3 rounds: 10 wall balls + 200m run, smooth transitions.', ['Wall Ball']),
    ],
  }),
  workout({
    workoutId: 'peak-08',
    phaseType: 'peak',
    sessionType: 'hyrox_simulation',
    durationMinutes: 55,
    intensity: 'hard',
    warmupTemplateId: 'hyrox_simulation_warmup',
    cooldownTemplateId: 'hyrox_simulation_cooldown',
    tags: ['peak', 'simulation', 'race_rhythm'],
    loadLevel: 'moderate',
    impactLevel: 'high',
    hyroxStationsUsed: ['Sled Push', 'Sled Pull', 'Burpee Broad Jump', 'Sandbag Lunges'],
    progressionLevel: 4,
    structure: [
      block('b1', 'Primer', 10, 'Transition rehearsal with race-pace breathing control.'),
      block('b2', 'Main set', 21, '3 rounds: 500m run + 15m sled push + 15m sled pull.', ['Sled Push', 'Sled Pull'], {
        movementCategory: 'squat_pattern',
        targetDemands: ['horizontal_force'],
        equipmentRequired: ['sled_push', 'plate_loaded_machines', 'treadmill'],
        preferenceTags: ['sled_push'],
        movementOptions: [
          movementOption('Sled Push', 'Sled Push', 'sled_push', ['hyrox_station'], 'exact'),
          movementOption('Prowler Push', 'Prowler Push', 'plate_loaded_machines', ['strength'], 'analogous'),
          movementOption('Treadmill Push-Off Drive', 'Treadmill Push-Off Drive', 'treadmill', ['fallback'], 'fallback'),
        ],
        defaultMovementId: 'Sled Push',
      }),
      block('b3', 'Finish', 24, '3 rounds: 6 burpee broad jumps + 10 sandbag lunges at controlled race rhythm.', ['Burpee Broad Jump', 'Sandbag Lunges']),
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
      if (!HYROX_SESSION_STRUCTURE_TYPES.includes(workoutItem.sessionStructureType)) {
        issues.push(`Invalid sessionStructureType on ${workoutItem.workoutId}`);
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
      for (const structureBlock of (workoutItem.structure || [])) {
        if (!Array.isArray(structureBlock.movementOptions) && structureBlock.movementOptions != null) {
          issues.push(`movementOptions must be an array on ${workoutItem.workoutId}:${structureBlock.blockId}`);
          continue;
        }
        if (!structureBlock.movementOptions) continue;
        if (!structureBlock.movementCategory || typeof structureBlock.movementCategory !== 'string') {
          issues.push(`movementCategory missing on ${workoutItem.workoutId}:${structureBlock.blockId}`);
        } else if (!HYROX_MOVEMENT_CATEGORIES.includes(structureBlock.movementCategory)) {
          issues.push(`Invalid movementCategory on ${workoutItem.workoutId}:${structureBlock.blockId}`);
        }
        if (structureBlock.movementOptions.length === 0) {
          issues.push(`movementOptions empty on ${workoutItem.workoutId}:${structureBlock.blockId}`);
          continue;
        }
        const optionIds = new Set();
        for (const option of structureBlock.movementOptions) {
          if (!option?.movementId || !option?.displayName || !option?.equipmentType) {
            issues.push(`Invalid movement option on ${workoutItem.workoutId}:${structureBlock.blockId}`);
            continue;
          }
          if (!HYROX_EQUIPMENT_TYPES.includes(option.equipmentType)) {
            issues.push(`Invalid movement option equipmentType on ${workoutItem.workoutId}:${structureBlock.blockId}:${option.movementId}`);
          }
          if (option.specificityType && !HYROX_MOVEMENT_SPECIFICITY_TYPES.includes(option.specificityType)) {
            issues.push(`Invalid movement option specificityType on ${workoutItem.workoutId}:${structureBlock.blockId}:${option.movementId}`);
          }
          optionIds.add(option.movementId);
        }
        if (!structureBlock.defaultMovementId || !optionIds.has(structureBlock.defaultMovementId)) {
          issues.push(`defaultMovementId missing from movementOptions on ${workoutItem.workoutId}:${structureBlock.blockId}`);
        }
        if (structureBlock.blockStructureType === 'superset' && (!Array.isArray(structureBlock.pairedMovements) || structureBlock.pairedMovements.length === 0)) {
          issues.push(`Superset block missing pairedMovements on ${workoutItem.workoutId}:${structureBlock.blockId}`);
        }
        if (structureBlock.blockStructureType === 'hybrid_strength' && !structureBlock.targetDemands?.length) {
          issues.push(`Hybrid block missing targetDemands on ${workoutItem.workoutId}:${structureBlock.blockId}`);
        }
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
    valid: issues.length === 0,
    issues,
    errors: issues,
    counts: Object.fromEntries(seenIdsByPhase.entries()),
    workoutCount: Array.from(seenIdsByPhase.values()).reduce((sum, count) => sum + count, 0),
    warmupCount: Object.keys(HYROX_WARMUP_TEMPLATES).length,
    cooldownCount: Object.keys(HYROX_COOLDOWN_TEMPLATES).length,
  };
}

export function validateHyroxWorkoutLibrary(library = HYROX_WORKOUT_LIBRARY) {
  return auditHyroxWorkoutLibrary(library);
}
