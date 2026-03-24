import test from 'node:test';
import assert from 'node:assert/strict';

import { programProfiles, weeklyTemplates } from './workoutSystemSchema.js';
import {
  generate5kWeeklyWorkoutSelection,
  generate5kWorkoutSchedule,
  get5kPhaseForWeek,
} from './5kWorkoutGenerator.js';
import {
  generateWeeklyWorkoutSelection,
  generateWorkoutSchedule,
} from './programWorkoutGenerator.js';

const HARD_SESSION_TYPES = new Set(['run_intervals', 'run_tempo']);

test('5k profile and templates are registered in normalized schema', () => {
  assert.deepEqual(programProfiles['5k'].supportedDaysPerWeek, [3, 4, 5]);
  assert.deepEqual(programProfiles['5k'].phaseSequence, ['foundation', 'base', 'build', 'peak', 'recovery_deload']);
  assert.equal(weeklyTemplates.some(template => template.programType === '5k' && template.daysPerWeek === 3), true);
  assert.equal(weeklyTemplates.some(template => template.programType === '5k' && template.daysPerWeek === 4), true);
  assert.equal(weeklyTemplates.some(template => template.programType === '5k' && template.daysPerWeek === 5), true);
});

test('5k weekly selection generates required slots for 3, 4, and 5-day plans', () => {
  const threeDay = generate5kWeeklyWorkoutSelection({ trainingDays: '3-day', weekNumber: 1, totalWeeks: 8, weekType: 'A' });
  const fourDay = generate5kWeeklyWorkoutSelection({ trainingDays: '4-day', weekNumber: 4, totalWeeks: 8, weekType: 'A' });
  const fiveDay = generate5kWeeklyWorkoutSelection({ trainingDays: '5-day', weekNumber: 6, totalWeeks: 10, weekType: 'A' });

  assert.equal(threeDay.length, 3);
  assert.equal(fourDay.length, 4);
  assert.equal(fiveDay.length, 5);
  assert.deepEqual(threeDay.map(session => session.sessionType), ['run_easy', 'run_intervals', 'run_long']);
  assert.deepEqual(fiveDay.map(session => session.sessionType), ['run_easy', 'run_intervals', 'recovery_pilates', 'run_tempo', 'run_long']);
});

test('5k generator enforces hard day caps and avoids back-to-back hard run days outside peak', () => {
  const generated = generate5kWeeklyWorkoutSelection({
    trainingDays: '5-day',
    weekNumber: 6,
    totalWeeks: 10,
    weekType: 'A',
  });

  const hardDayIndexes = generated
    .map((session, index) => (HARD_SESSION_TYPES.has(session.sessionType) ? index : -1))
    .filter(index => index >= 0);
  assert.ok(hardDayIndexes.length <= 3);
  assert.ok(hardDayIndexes.every((index, offset) => offset === 0 || hardDayIndexes[offset - 1] !== index - 1));
});

test('5k progression changes by phase and includes taper/recovery deload rules', () => {
  const foundation = generate5kWeeklyWorkoutSelection({ trainingDays: '3-day', weekNumber: 1, totalWeeks: 8, weekType: 'A' });
  const build = generate5kWeeklyWorkoutSelection({ trainingDays: '3-day', weekNumber: 5, totalWeeks: 8, weekType: 'A' });
  const taper = generate5kWeeklyWorkoutSelection({ trainingDays: '3-day', weekNumber: 8, totalWeeks: 8, weekType: 'A' });

  assert.equal(get5kPhaseForWeek({ weekNumber: 1, totalWeeks: 8 }).phaseType, 'foundation');
  assert.equal(get5kPhaseForWeek({ weekNumber: 5, totalWeeks: 8 }).phaseType, 'build');
  assert.equal(get5kPhaseForWeek({ weekNumber: 8, totalWeeks: 8 }).phaseType, 'recovery_deload');
  assert.match(foundation[0].prescription, /2-3 miles/);
  assert.match(build[1].prescription, /600m|tempo/i);
  assert.match(taper[0].prescription, /relaxed/i);
});

test('programType dispatch separates 5k from hyrox generation', () => {
  const fiveKFromDispatcher = generateWeeklyWorkoutSelection({
    programType: '5k',
    trainingDays: '4-day',
    weekNumber: 4,
    totalWeeks: 8,
    weekType: 'A',
  });
  const hyroxFromDispatcher = generateWorkoutSchedule({
    programType: 'hyrox',
    trainingDays: '4-day',
    weekNumber: 4,
    weekType: 'A',
    schedulePhase: 'Base',
  });

  assert.ok(fiveKFromDispatcher.every(session => session.programType === '5k'));
  assert.ok(hyroxFromDispatcher.every(session => session.programType === 'hyrox'));
});

test('5k schedule output is structurally complete', () => {
  const generated = generate5kWorkoutSchedule({ trainingDays: '4-day', weekNumber: 7, totalWeeks: 10, weekType: 'A' });

  assert.equal(generated.length, 4);
  assert.ok(generated.every(session => typeof session.workoutId === 'string' && session.workoutId.length > 0));
  assert.ok(generated.every(session => typeof session.warmupTemplateId === 'string'));
  assert.ok(generated.every(session => typeof session.cooldownTemplateId === 'string'));
  assert.ok(generated.every(session => Array.isArray(session.structure) && session.structure.length > 0));
});
