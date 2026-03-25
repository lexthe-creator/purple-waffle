import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAppState } from './workoutSystemState.js';

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
