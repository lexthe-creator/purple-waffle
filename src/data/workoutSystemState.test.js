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
      ageGroup: 'masters',
      goal: 'endurance',
      preferredSessionDuration: 50,
      lowImpactPreference: true,
    },
  });

  const restored = normalizeAppState(JSON.parse(JSON.stringify(initial)));

  assert.equal(initial.fitnessSettings.programType, '5k');
  assert.equal(restored.fitnessSettings.programType, '5k');
  assert.equal(restored.fitnessSettings.raceDate, '2026-04-01');
  assert.equal(restored.fitnessSettings.ageGroup, 'masters');
  assert.equal(restored.fitnessSettings.goal, 'endurance');
  assert.equal(restored.fitnessSettings.preferredSessionDuration, 50);
  assert.equal(restored.fitnessSettings.lowImpactPreference, true);
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
  assert.equal(normalized.generatedSessionMeta.originalScheduledDate, '2026-04-06');
  assert.equal(normalized.generatedSessionMeta.currentScheduledDate, '2026-04-06');
  assert.equal(normalized.generatedSessionMeta.skipStatus, 'not_skipped');
});

test('normalizeWorkoutRecord preserves workout logging structure while canonicalizing legacy active status', () => {
  const normalized = normalizeWorkoutRecord({
    name: 'Structured Session',
    status: 'active',
    scheduledDate: '2026-04-06',
    workoutLog: {
      source: 'manual',
      startedAt: 1000,
      notes: 'Felt steady',
      currentSegmentId: 'segment-2',
      currentSegmentIndex: 1,
      segments: [
        { id: 'segment-1', label: 'Warm-up', completed: true, completedAt: 1100 },
        { id: 'segment-2', label: 'Intervals', completed: false, metrics: { intervalCount: 2 } },
      ],
      externalRefs: {
        appleHealthWorkoutId: 'health-123',
      },
    },
  });

  assert.equal(normalized.status, 'planned');
  assert.equal(normalized.workoutLog.startedAt, 1000);
  assert.equal(normalized.workoutLog.notes, 'Felt steady');
  assert.equal(normalized.workoutLog.currentSegmentId, 'segment-2');
  assert.equal(normalized.workoutLog.segments.length, 2);
  assert.equal(normalized.workoutLog.segments[0].completed, true);
  assert.equal(normalized.workoutLog.segments[1].metrics.intervalCount, 2);
  assert.equal(normalized.workoutLog.externalRefs.appleHealthWorkoutId, 'health-123');
  assert.equal(normalized.generatedSessionMeta.lifecycle.status, 'planned');
});

test('normalizeWorkoutRecord exposes explicit move/skip metadata for moved generated sessions', () => {
  const normalized = normalizeWorkoutRecord({
    name: 'Moved Session',
    programType: '5k',
    plannedDate: '2026-04-08',
    scheduledDate: '2026-04-10',
    status: 'planned',
    sessionType: 'run_easy',
    source: {
      origin: 'program',
      libraryId: 'run_beginner_easy_base',
      sessionType: 'run_easy',
    },
  });

  assert.equal(normalized.generatedSessionMeta.originalScheduledDate, '2026-04-08');
  assert.equal(normalized.generatedSessionMeta.currentScheduledDate, '2026-04-10');
  assert.equal(normalized.generatedSessionMeta.movedFrom, '2026-04-08');
  assert.equal(normalized.generatedSessionMeta.movedTo, '2026-04-10');
  assert.equal(normalized.generatedSessionMeta.lifecycle.isMoved, true);
  assert.equal(normalized.generatedSessionMeta.generationSource.templateId, 'run_beginner_easy_base');
});

test('normalizeWorkoutRecord preserves explicit skip metadata when provided', () => {
  const normalized = normalizeWorkoutRecord({
    name: 'Skipped Session',
    programType: 'strength_block',
    plannedDate: '2026-04-12',
    scheduledDate: '2026-04-12',
    status: 'skipped',
    generatedSessionMeta: {
      originalScheduledDate: '2026-04-12',
      currentScheduledDate: '2026-04-12',
      skipStatus: 'skipped',
      skipReason: 'travel',
      wasSkipped: true,
      generationSource: {
        kind: 'library',
        programType: 'strength_block',
        templateId: 'strength_beginner_full_body_a',
        sessionType: 'strength_full',
      },
      lifecycle: {
        status: 'skipped',
        isMoved: false,
        isRescheduled: false,
        isSkipped: true,
      },
    },
  });

  assert.equal(normalized.generatedSessionMeta.skipStatus, 'skipped');
  assert.equal(normalized.generatedSessionMeta.skipReason, 'travel');
  assert.equal(normalized.generatedSessionMeta.wasSkipped, true);
  assert.equal(normalized.generatedSessionMeta.lifecycle.isSkipped, true);
});
