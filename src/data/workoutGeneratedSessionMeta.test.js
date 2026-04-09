import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMovedGeneratedSessionMeta,
  applySkippedGeneratedSessionMeta,
  getGeneratedSessionMetaForUi,
  getWorkoutMetaDisplay,
} from './workoutGeneratedSessionMeta.js';

test('getGeneratedSessionMetaForUi reconstructs safe fallback metadata from legacy workout fields', () => {
  const meta = getGeneratedSessionMetaForUi({
    plannedDate: '2026-04-08',
    scheduledDate: '2026-04-10',
    status: 'planned',
  });

  assert.equal(meta.originalScheduledDate, '2026-04-08');
  assert.equal(meta.currentScheduledDate, '2026-04-10');
  assert.equal(meta.movedFrom, '2026-04-08');
  assert.equal(meta.movedTo, '2026-04-10');
  assert.equal(meta.lifecycle.isMoved, true);
});

test('applySkippedGeneratedSessionMeta writes explicit skip metadata while preserving lineage', () => {
  const updated = applySkippedGeneratedSessionMeta({
    plannedDate: '2026-04-12',
    scheduledDate: '2026-04-12',
    programType: 'strength_block',
    source: { libraryId: 'strength_beginner_full_body_a', sessionType: 'strength_full' },
  }, { skipReason: 'travel' });

  assert.equal(updated.generatedSessionMeta.skipStatus, 'skipped');
  assert.equal(updated.generatedSessionMeta.skipReason, 'travel');
  assert.equal(updated.generatedSessionMeta.wasSkipped, true);
  assert.equal(updated.generatedSessionMeta.lifecycle.isSkipped, true);
  assert.equal(updated.generatedSessionMeta.generationSource.templateId, 'strength_beginner_full_body_a');
});

test('getGeneratedSessionMetaForUi keeps legacy skipped records safe when explicit metadata is missing', () => {
  const meta = getGeneratedSessionMetaForUi({
    scheduledDate: '2026-04-12',
    status: 'skipped',
  });

  assert.equal(meta.originalScheduledDate, '2026-04-12');
  assert.equal(meta.currentScheduledDate, '2026-04-12');
  assert.equal(meta.skipReason, null);
  assert.equal(meta.wasSkipped, true);
  assert.equal(meta.lifecycle.isSkipped, true);
});

test('applyMovedGeneratedSessionMeta preserves earliest original date across repeated moves', () => {
  const updated = applyMovedGeneratedSessionMeta({
    plannedDate: '2026-04-08',
    scheduledDate: '2026-04-12',
    generatedSessionMeta: {
      originalScheduledDate: '2026-04-08',
      currentScheduledDate: '2026-04-12',
      movedFrom: '2026-04-08',
      movedTo: '2026-04-12',
      skipStatus: 'not_skipped',
      skipReason: null,
      wasSkipped: false,
      generationSource: {
        kind: 'library',
        programType: '5k',
        templateId: 'run_beginner_easy_base',
        sessionType: 'run_easy',
      },
      lifecycle: {
        status: 'planned',
        isMoved: true,
        isRescheduled: true,
        isSkipped: false,
      },
    },
  }, {
    originalScheduledDate: '2026-04-08',
    nextScheduledDate: '2026-04-15',
  });

  assert.equal(updated.generatedSessionMeta.originalScheduledDate, '2026-04-08');
  assert.equal(updated.generatedSessionMeta.currentScheduledDate, '2026-04-15');
  assert.equal(updated.generatedSessionMeta.movedTo, '2026-04-15');
  assert.equal(updated.generatedSessionMeta.generationSource.templateId, 'run_beginner_easy_base');
});

test('getWorkoutMetaDisplay formats moved and skipped metadata without owning date formatting', () => {
  const label = getWorkoutMetaDisplay({
    originalScheduledDate: '2026-04-08',
    currentScheduledDate: '2026-04-10',
    movedFrom: '2026-04-08',
    movedTo: '2026-04-10',
    skipReason: 'travel',
    lifecycle: {
      isMoved: true,
      isSkipped: true,
    },
  }, '2026-04-10', value => value.slice(5));

  assert.equal(label, 'Moved from 04-08 · Skipped · travel');
});

test('getWorkoutMetaDisplay returns a concise skipped label when no skip reason exists', () => {
  const label = getWorkoutMetaDisplay({
    currentScheduledDate: '2026-04-12',
    lifecycle: {
      isSkipped: true,
    },
  }, '2026-04-12', value => value.slice(5));

  assert.equal(label, 'Skipped');
});
