import { pathToFileURL } from 'node:url';
import { adaptGeneratedSessionToWorkoutRecord } from '../src/data/adaptGeneratedSessionToWorkoutRecord.js';
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

  const adaptedRunSession = adaptGeneratedSessionToWorkoutRecord({
    id: 'run-1',
    label: 'Base Run',
    title: 'Base Run',
    programType: '5k',
    category: 'run',
    sessionTypeCanonical: 'run_easy',
    durationMinutes: 45,
    dateKey: '2026-04-10',
    content: {
      version: 1,
      source: 'program',
      blocks: [{
        id: 'run-block',
        title: 'Main Set',
        type: 'main',
        exercises: [{ id: 'run-ex-1', name: 'Easy Run', duration: '30 min' }],
      }],
      notes: ['Stay conversational'],
    },
  }, { createdAt: 111 });
  assert(adaptedRunSession.type === 'run', 'Adapter should preserve run type for 5k sessions', issues);
  assert(adaptedRunSession.scheduledDate === '2026-04-10', 'Adapter should map scheduledDate from dateKey', issues);
  assert(adaptedRunSession.plannedDurationMinutes === 45, 'Adapter should map plannedDurationMinutes from durationMinutes', issues);
  assert(adaptedRunSession.content.blocks.length === 1, 'Adapter should preserve explicit content blocks', issues);
  assert(adaptedRunSession.createdAt === 111, 'Adapter should use override createdAt deterministically', issues);

  const adaptedStrengthSession = adaptGeneratedSessionToWorkoutRecord({
    workoutId: 'strength-1',
    programType: 'strength_block',
    category: 'strength',
    sessionTypeCanonical: 'strength_full',
    duration: 50,
    dateKey: '2026-04-11',
    structure: [{
      blockId: 'main',
      name: 'Main Set',
      details: '3 x 8 squat',
      durationMinutes: 25,
      rounds: 3,
    }],
  }, { createdAt: 222 });
  assert(adaptedStrengthSession.type === 'strength', 'Adapter should derive strength type from category', issues);
  assert(adaptedStrengthSession.title === 'Strength Full', 'Adapter should fall back to readable session title', issues);
  assert(adaptedStrengthSession.content.blocks.length === 1, 'Adapter should normalize structure into content', issues);
  assert(adaptedStrengthSession.exercises.length > 0, 'Adapter should flatten exercises from normalized content', issues);

  const adaptedHyroxSession = adaptGeneratedSessionToWorkoutRecord({
    id: 'hyrox-1',
    title: 'Power Simulation',
    programType: 'hyrox',
    sessionTypeCanonical: 'hyrox_sim',
    durationMinutes: 60,
    dateKey: '2026-04-12',
    librarySessionId: 'hyrox_sim_a',
    warmupTemplateId: 'hyrox_standard_v1',
    cooldownTemplateId: 'hyrox_standard_v1',
    generatedSessionMeta: {
      originalScheduledDate: '2026-04-12',
      currentScheduledDate: '2026-04-12',
      movedFrom: null,
      movedTo: null,
      skipStatus: 'not_skipped',
      skipReason: null,
      wasSkipped: false,
      generationSource: {
        kind: 'hyrox_generator',
        programType: 'hyrox',
        templateId: 'hyrox_sim_a',
        sessionType: 'hyrox_sim',
      },
      lifecycle: {
        status: 'scheduled',
        isMoved: false,
        isRescheduled: false,
        isSkipped: false,
      },
    },
    ex: [{ id: 'sled', name: 'Sled Push', detail: '4 x 20m' }],
  }, { createdAt: 333 });
  assert(adaptedHyroxSession.type === 'hyrox', 'Adapter should preserve hyrox type', issues);
  assert(adaptedHyroxSession.source.libraryId === 'hyrox_sim_a', 'Adapter should build source libraryId from librarySessionId', issues);
  assert(adaptedHyroxSession.generatedSessionMeta.generationSource.templateId === 'hyrox_sim_a', 'Adapter should preserve generatedSessionMeta', issues);

  const normalizedAdaptedWorkout = normalizeWorkoutRecord(adaptedHyroxSession, 3);
  assert(normalizedAdaptedWorkout.status === 'planned', 'Normalized adapted workout should remain planned', issues);
  assert(normalizedAdaptedWorkout.content.blocks.length >= 1, 'Normalized adapted workout should remain executable', issues);

  return {
    ok: issues.length === 0,
    issues,
    raw: { normalizedAppState, normalizedProfile, normalizedWorkout, adaptedRunSession, adaptedStrengthSession, adaptedHyroxSession },
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
