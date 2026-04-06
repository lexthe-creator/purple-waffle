import { pathToFileURL } from 'node:url';
import {
  normalizeAppState,
  normalizeProfile,
  normalizeWorkoutRecord,
} from '../src/data/workoutSystemState.js';

function assert(condition, message, issues) {
  if (!condition) issues.push(message);
}

export function runWorkoutSystemStateAudit() {
  const issues = [];

  const legacyAppState = {
    fitnessSettings: {
      programType: 'hyrox',
      programStartDate: '2025-01-15',
      selectedFrequency: '5-day',
      equipmentAccess: 'limited',
      preferredRunMode: 'treadmill',
      preferredEngineModes: ['rower', 'bike'],
      equipmentAvailability: {
        dumbbells: true,
        sled_push: true,
      },
    },
  };
  const normalizedAppState = normalizeAppState(legacyAppState);
  assert(normalizedAppState.fitnessSettings.equipmentMode === 'limited_gym', 'App state should normalize equipmentMode from legacy access', issues);
  assert(normalizedAppState.fitnessSettings.trainingDays === '5-day', 'App state should preserve selected training frequency', issues);
  assert(normalizedAppState.fitnessSettings.equipmentAvailability.dumbbells === true, 'App state should preserve equipment overrides', issues);
  assert(normalizedAppState.fitnessSettings.equipmentAvailability.wall_ball === true, 'App state should derive limited-gym defaults', issues);

  const legacyProfile = {
    athlete: {
      fiveKTime: '24:30',
      strongStations: ['Row'],
      weakStations: ['Wall Ball'],
      bodyWeight: 168,
    },
    workoutHistory: [
      { id: 'wk-1', status: 'active', name: 'Legacy active workout', exercises: [{ name: 'Warm-up' }] },
      { id: 'wk-2', status: 'done', name: 'Legacy completed workout', exercises: [{ name: 'Main set' }] },
      { id: 'wk-3', status: 'moved', name: 'Legacy moved workout' },
    ],
  };
  const normalizedProfile = normalizeProfile(legacyProfile);
  assert(normalizedProfile.athlete.fiveKTime === '24:30', 'Profile should preserve athlete data', issues);
  assert(normalizedProfile.workoutHistory[0]?.status === 'planned', 'Legacy active workout should normalize to planned', issues);
  assert(normalizedProfile.workoutHistory[1]?.status === 'completed', 'Legacy done workout should normalize to completed', issues);
  assert(normalizedProfile.workoutHistory[2]?.status === 'moved', 'Workout statuses already supported by schema should remain intact', issues);

  const normalizedWorkout = normalizeWorkoutRecord({ status: 'done', exercises: [{ name: 'Warm-up', completed: true }] }, 2);
  assert(normalizedWorkout.status === 'completed', 'Workout record normalization should map done to completed', issues);
  assert(Array.isArray(normalizedWorkout.exercises), 'Workout record normalization should preserve exercises array', issues);
  assert(normalizedWorkout.programWeek === normalizedWorkout.week, 'Workout record normalization should expose programWeek', issues);
  assert(normalizedWorkout.plannedDurationMinutes === normalizedWorkout.duration, 'Workout record normalization should expose plannedDurationMinutes', issues);
  assert(Array.isArray(normalizedWorkout.content?.blocks), 'Workout record normalization should build structured content blocks', issues);
  assert(normalizedWorkout.content?.blocks?.[0]?.exercises?.[0]?.name === 'Warm-up', 'Structured workout content should preserve exercise names', issues);

  return {
    ok: issues.length === 0,
    issues,
    raw: { normalizedAppState, normalizedProfile, normalizedWorkout },
  };
}

function isDirectExecution() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  const result = runWorkoutSystemStateAudit();
  if (result.ok) {
    console.log('Workout system state audit passed.');
    process.exit(0);
  }

  console.error('Workout system state audit failed with the following issues:');
  for (const issue of result.issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}
