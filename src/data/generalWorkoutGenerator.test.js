import test from 'node:test';
import assert from 'node:assert/strict';

import {
  generateGeneralWorkoutSchedule,
  generateWorkoutWeekFromProfile,
  normalizeGeneratorProfile,
} from './generalWorkoutGenerator.js';

test('normalizeGeneratorProfile applies safe defaults for incomplete profile data', () => {
  const normalized = normalizeGeneratorProfile({ programType: 'strength' });

  assert.equal(normalized.programType, 'strength_block');
  assert.equal(normalized.level, 'beginner');
  assert.equal(normalized.ageGroup, 'adult');
  assert.equal(normalized.goal, 'general_fitness');
  assert.equal(normalized.daysPerWeek, 4);
});

test('running profile generates a full reusable week with structured content', () => {
  const generated = generateWorkoutWeekFromProfile({
    programType: 'running',
    level: 'beginner',
    ageGroup: 'adult',
    goal: 'endurance',
    equipmentAccess: 'treadmill',
    daysPerWeek: 4,
    preferredSessionDuration: 35,
  });

  assert.equal(generated.length, 4);
  assert.ok(generated.every(session => session.programType === '5k'));
  assert.ok(generated.every(session => Array.isArray(session.content?.blocks) && session.content.blocks.length > 0));
  assert.ok(generated.every(session => session.generatedSessionMeta?.generationSource?.templateId));
  assert.ok(generated.every(session => session.generatedSessionMeta?.lifecycle?.status === 'scheduled'));
  assert.ok(generated.some(session => session.sessionType === 'recovery_walk_mobility'));
});

test('strength profile supports masters-friendly generation', () => {
  const generated = generateWorkoutWeekFromProfile({
    programType: 'strength',
    level: 'beginner',
    ageGroup: 'masters',
    goal: 'general_fitness',
    equipmentAccess: 'dumbbells',
    daysPerWeek: 3,
    preferredSessionDuration: 40,
    lowImpact: true,
  });

  assert.equal(generated.length, 3);
  assert.ok(generated.every(session => session.programType === 'strength_block'));
  assert.ok(generated.some(session => /conservative|recovery|impact/i.test(session.coachingNote)));
});

test('hyrox schedule still routes through the specialized generator with compatible output', () => {
  const generated = generateGeneralWorkoutSchedule({
    programType: 'hyrox',
    trainingDays: '4-day',
    weekNumber: 8,
    schedulePhase: 'Base',
    fitnessSettings: {
      fitnessLevel: 'beginner',
      preferredSessionDuration: 45,
    },
    athleteProfile: {
      age: 58,
    },
  });

  assert.equal(generated.length, 4);
  assert.ok(generated.every(session => session.programType === 'hyrox'));
  assert.ok(generated.every(session => typeof session.warmupTemplateId === 'string'));
  assert.ok(generated.every(session => Array.isArray(session.content?.blocks) && session.content.blocks.length > 0));
  assert.ok(generated.every(session => session.generatedSessionMeta?.generationSource?.kind === 'hyrox_generator'));
});

test('fitness settings inputs directly influence generated library-backed weeks', () => {
  const standard = generateGeneralWorkoutSchedule({
    programType: 'strength_block',
    trainingDays: '3-day',
    fitnessSettings: {
      goal: 'strength',
      ageGroup: 'adult',
      preferredSessionDuration: 45,
      lowImpactPreference: false,
      equipmentAccess: 'dumbbells',
    },
  });
  const lowImpactMasters = generateGeneralWorkoutSchedule({
    programType: 'strength_block',
    trainingDays: '3-day',
    fitnessSettings: {
      goal: 'recovery',
      ageGroup: 'masters',
      preferredSessionDuration: 30,
      lowImpactPreference: true,
      equipmentAccess: 'dumbbells',
    },
  });

  assert.equal(standard.length, 3);
  assert.equal(lowImpactMasters.length, 3);
  assert.notDeepEqual(
    standard.map(session => session.librarySessionId),
    lowImpactMasters.map(session => session.librarySessionId),
  );
  assert.ok(lowImpactMasters.some(session => session.sessionType === 'recovery_walk_mobility'));
  assert.ok(lowImpactMasters.every(session => typeof session.coachingNote === 'string' && session.coachingNote.length > 0));
});
