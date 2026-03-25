import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HYROX_SCHEDULE_PHASE_MAP,
  buildWeeklySchedule,
  getPhaseForWeek,
  getWeeklyTemplate,
} from './hyroxPlan.js';
import {
  HYROX_COOLDOWN_TEMPLATES,
  HYROX_WARMUP_TEMPLATES,
  validateHyroxWorkoutLibrary,
} from './hyroxWorkoutLibrary.js';
import {
  generateHyroxWeeklyWorkoutSelection,
  getHyroxLibraryPhaseForSchedulePhase,
  generateHyroxWorkoutSchedule,
} from './hyroxWorkoutGenerator.js';

const START_DATE = '2026-01-05';

test('HYROX library still validates', () => {
  const validation = validateHyroxWorkoutLibrary();
  assert.equal(validation.ok, true);
  assert.equal(validation.issues.length, 0);
});

test('4-day and 5-day schedules generate the correct count', () => {
  const fourDay = buildWeeklySchedule({
    trainingDays: '4-day',
    weekNumber: 1,
    startDate: START_DATE,
  });
  const fiveDay = buildWeeklySchedule({
    trainingDays: '5-day',
    weekNumber: 1,
    startDate: START_DATE,
  });

  assert.equal(fourDay.length, 4);
  assert.equal(fiveDay.length, 5);
});

test('buildWeeklySchedule routes by programType and preserves the active program id', () => {
  const fiveK = buildWeeklySchedule({
    trainingDays: '4-day',
    weekNumber: 1,
    startDate: START_DATE,
    programType: '5k',
  });
  const strength = buildWeeklySchedule({
    trainingDays: '4-day',
    weekNumber: 1,
    startDate: START_DATE,
    programType: 'strength_block',
  });

  assert.ok(fiveK.length > 0);
  assert.ok(fiveK.every(session => session.programType === '5k'));
  assert.deepEqual(strength, []);
});

test('generator emits the expected workout count for each training day mode', () => {
  const fourDay = generateHyroxWeeklyWorkoutSelection({
    trainingDays: '4-day',
    weekNumber: 1,
    weekType: 'A',
    schedulePhase: 'Base',
  });
  const fiveDay = generateHyroxWeeklyWorkoutSelection({
    trainingDays: '5-day',
    weekNumber: 1,
    weekType: 'A',
    schedulePhase: 'Base',
  });

  assert.equal(fourDay.length, 4);
  assert.equal(fiveDay.length, 5);
});

test('movement option blocks resolve deterministically and strip raw option arrays from output', () => {
  const first = generateHyroxWeeklyWorkoutSelection({
    trainingDays: '4-day',
    weekNumber: 10,
    weekType: 'A',
    schedulePhase: 'Build',
  });
  const second = generateHyroxWeeklyWorkoutSelection({
    trainingDays: '4-day',
    weekNumber: 10,
    weekType: 'A',
    schedulePhase: 'Build',
  });

  assert.deepEqual(first.map(workout => workout.workoutId), second.map(workout => workout.workoutId));
  const blocksWithSelections = first.flatMap(workout => workout.structure.filter(block => block.selectedMovementId));
  assert.ok(blocksWithSelections.length > 0);
  assert.ok(blocksWithSelections.every(block => !('movementOptions' in block)));
  assert.ok(blocksWithSelections.every(block => typeof block.selectedMovementId === 'string' && block.selectedMovementId.length > 0));
});

test('movement options honor limited equipment profiles', () => {
  const limited = generateHyroxWeeklyWorkoutSelection({
    trainingDays: '4-day',
    weekNumber: 24,
    weekType: 'A',
    schedulePhase: 'Peak',
    equipmentProfile: 'limited_gym',
  });
  const limitedSelections = limited.flatMap(workout => workout.structure).filter(block => block.selectedMovement);
  assert.ok(limitedSelections.length > 0);
  assert.ok(limitedSelections.every((block) => ['treadmill', 'bodyweight'].includes(block.selectedMovement.equipmentType)));
});

test('phase mapping is explicit and stable', () => {
  assert.equal(HYROX_SCHEDULE_PHASE_MAP.Base, 'foundation');
  assert.equal(HYROX_SCHEDULE_PHASE_MAP.Build, 'base');
  assert.equal(HYROX_SCHEDULE_PHASE_MAP.Specificity, 'build');
  assert.equal(HYROX_SCHEDULE_PHASE_MAP.Peak, 'peak');
  assert.equal(HYROX_SCHEDULE_PHASE_MAP.Taper, 'peak');
  assert.equal(getHyroxLibraryPhaseForSchedulePhase('Peak'), 'peak');
  assert.equal(getPhaseForWeek(30).name, 'Taper');
});

test('taper weeks stay taper on generated output', () => {
  const generated = generateHyroxWorkoutSchedule({
    trainingDays: '5-day',
    weekNumber: 30,
    weekType: 'B',
    schedulePhase: 'Taper',
  });

  assert.equal(generated.length, 5);
  assert.ok(generated.every(session => session.schedulePhaseType === 'Taper'));
  assert.ok(generated.some(session => session.sessionType === 'hyrox_functional'));
  assert.ok(generated.some(session => session.sessionType === 'hyrox_simulation'));
});

test('generated workouts preserve warmup and cooldown references', () => {
  const generated = buildWeeklySchedule({
    trainingDays: '4-day',
    weekNumber: 10,
    startDate: START_DATE,
    weekType: 'B',
  });
  const generatedFiveDay = buildWeeklySchedule({
    trainingDays: '5-day',
    weekNumber: 10,
    startDate: START_DATE,
    weekType: 'B',
  });

  assert.equal(generated.length, 4);
  assert.equal(generatedFiveDay.length, 5);
  assert.ok(generated.every(session => typeof session.warmupTemplateId === 'string' && HYROX_WARMUP_TEMPLATES[session.warmupTemplateId]));
  assert.ok(generatedFiveDay.every(session => typeof session.warmupTemplateId === 'string' && HYROX_WARMUP_TEMPLATES[session.warmupTemplateId]));
  assert.ok(generated.every(session => typeof session.cooldownTemplateId === 'string' && HYROX_COOLDOWN_TEMPLATES[session.cooldownTemplateId]));
  assert.ok(generatedFiveDay.every(session => typeof session.cooldownTemplateId === 'string' && HYROX_COOLDOWN_TEMPLATES[session.cooldownTemplateId]));
  assert.ok(generated.every(session => typeof session.shortVersionRule === 'string' && session.shortVersionRule.length > 0));
  assert.ok(generatedFiveDay.every(session => typeof session.shortVersionRule === 'string' && session.shortVersionRule.length > 0));
  assert.ok(generated.every(session => Array.isArray(session.ex) && session.ex.length > 0));
  assert.ok(generatedFiveDay.every(session => Array.isArray(session.ex) && session.ex.length > 0));
});

test('weekly template remains generator-driven', () => {
  const sessions = getWeeklyTemplate({
    trainingDays: '4-day',
    weekNumber: 1,
    weekType: 'A',
  });

  assert.equal(sessions.length, 4);
  assert.ok(sessions.every(session => session.type === 'hyrox'));
});
