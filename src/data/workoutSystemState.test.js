import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAppState, normalizeWorkoutRecord } from './workoutSystemState.js';

test('normalizeAppState preserves canonical programType through a saved round trip', () => {
  const initial = normalizeAppState({
    fitnessSettings: {
      programType: '5k',
      programStartDate: '2026-01-05',
      trainingDays: '4-day',
      raceDate: '2026-04-01',
    },
  });

  const restored = normalizeAppState(JSON.parse(JSON.stringify(initial)));

  assert.equal(initial.fitnessSettings.programType, '5k');
  assert.equal(restored.fitnessSettings.programType, '5k');
  assert.equal(restored.fitnessSettings.raceDate, '2026-04-01');
});

test('normalizeAppState maps legacy strength settings to strength_block', () => {
  const normalized = normalizeAppState({
    fitnessSettings: {
      programType: 'strength',
      programStartDate: '2026-01-05',
      selectedFrequency: '5-day',
    },
  });

  assert.equal(normalized.fitnessSettings.programType, 'strength_block');
  assert.equal(normalized.fitnessSettings.trainingDays, '5-day');
});

test('normalizeWorkoutRecord builds future-ready workout structure', () => {
  const normalized = normalizeWorkoutRecord({
    name: 'Tempo Builder',
    programName: '5K run builder',
    programType: '5k',
    week: 4,
    duration: 45,
    plannedTime: '06:30',
    scheduledDate: '2026-04-06',
    status: 'done',
    exercises: [
      { name: 'Warm-up', timedEffort: '10 min', cue: 'Relax shoulders' },
      { name: 'Main Set', sets: 4, interval: '4 min on / 2 min easy', effort: 'Threshold' },
    ],
  });

  assert.equal(normalized.programWeek, 4);
  assert.equal(normalized.plannedDurationMinutes, 45);
  assert.equal(normalized.date, '2026-04-06');
  assert.equal(normalized.status, 'completed');
  assert.equal(normalized.lifecycleStatus, 'done');
  assert.equal(normalized.statusLabel, 'Done');
  assert.equal(normalized.plannedLabel, '06:30 · 45 min');
  assert.equal(normalized.content.blocks.length, 2);
  assert.equal(normalized.content.blocks[1].exercises[0].interval, '4 min on / 2 min easy');
  assert.equal(normalized.contentSummary.blockCount, 2);
  assert.equal(normalized.contentSummary.exerciseCount, 2);
  assert.equal(normalized.contentSummary.hasIntervals, true);
  assert.equal(normalized.source.origin, 'program');
});
