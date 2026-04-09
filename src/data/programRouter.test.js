import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROGRAM_TYPES,
  generateProgramWorkoutSchedule,
  normalizeProgramType,
} from './programRouter.js';

test('normalizeProgramType maps legacy aliases to canonical program ids', () => {
  assert.equal(normalizeProgramType('hyrox plan'), PROGRAM_TYPES.HYROX);
  assert.equal(normalizeProgramType('5k run builder'), PROGRAM_TYPES.RUN_5K);
  assert.equal(normalizeProgramType('running'), PROGRAM_TYPES.RUN_5K);
  assert.equal(normalizeProgramType('strength'), PROGRAM_TYPES.STRENGTH);
  assert.equal(normalizeProgramType('strength block'), PROGRAM_TYPES.STRENGTH);
});

test('generateProgramWorkoutSchedule dispatches by canonical program type', () => {
  const fiveK = generateProgramWorkoutSchedule({
    programType: '5k',
    trainingDays: '4-day',
    weekNumber: 4,
    weekType: 'A',
    totalWeeks: 8,
  });
  const hyrox = generateProgramWorkoutSchedule({
    programType: 'hyrox',
    trainingDays: '4-day',
    weekNumber: 4,
    weekType: 'A',
  });
  const strength = generateProgramWorkoutSchedule({
    programType: 'strength_block',
    trainingDays: '4-day',
    weekNumber: 4,
    weekType: 'A',
  });

  assert.ok(fiveK.length > 0);
  assert.ok(fiveK.every(session => session.programType === '5k'));
  assert.ok(hyrox.length > 0);
  assert.ok(hyrox.every(session => session.programType === 'hyrox'));
  assert.ok(strength.length > 0);
  assert.ok(strength.every(session => session.programType === 'strength_block'));
});
