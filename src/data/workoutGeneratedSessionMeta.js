function readExistingMeta(item) {
  return item?.generatedSessionMeta && typeof item.generatedSessionMeta === 'object'
    ? item.generatedSessionMeta
    : {};
}

function resolveGenerationSource(workout, existingMeta = {}) {
  return {
    kind: existingMeta.generationSource?.kind
      || (workout?.programType || workout?.programId ? 'program' : 'manual'),
    programType: existingMeta.generationSource?.programType
      || workout?.programType
      || workout?.programId
      || null,
    templateId: existingMeta.generationSource?.templateId
      || workout?.source?.libraryId
      || workout?.workoutId
      || null,
    sessionType: existingMeta.generationSource?.sessionType
      || workout?.sessionType
      || workout?.sessionTypeCanonical
      || workout?.source?.sessionType
      || null,
  };
}

export function getGeneratedSessionMetaForUi(item) {
  if (!item) return null;

  const meta = readExistingMeta(item);
  const originalScheduledDate = meta.originalScheduledDate || item.plannedDate || item.dateKey || item.scheduledDate || null;
  const currentScheduledDate = meta.currentScheduledDate || item.scheduledDate || item.dateKey || item.plannedDate || null;
  const movedFrom = meta.movedFrom || (
    originalScheduledDate
    && currentScheduledDate
    && originalScheduledDate !== currentScheduledDate
      ? originalScheduledDate
      : null
  );
  const movedTo = meta.movedTo || (
    originalScheduledDate
    && currentScheduledDate
    && originalScheduledDate !== currentScheduledDate
      ? currentScheduledDate
      : null
  );
  const skipStatus = meta.skipStatus || (item.status === 'skipped' ? 'skipped' : 'not_skipped');
  const skipReason = meta.skipReason || null;
  const wasSkipped = meta.wasSkipped === true || skipStatus === 'skipped' || item.status === 'skipped';

  return {
    originalScheduledDate,
    currentScheduledDate,
    movedFrom,
    movedTo,
    skipStatus,
    skipReason,
    wasSkipped,
    generationSource: meta.generationSource || null,
    lifecycle: {
      status: meta.lifecycle?.status || item.status || 'planned',
      isMoved: meta.lifecycle?.isMoved === true || Boolean(movedFrom || movedTo),
      isRescheduled: meta.lifecycle?.isRescheduled === true || Boolean(movedTo),
      isSkipped: meta.lifecycle?.isSkipped === true || wasSkipped,
    },
  };
}

export function getWorkoutMetaDisplay(meta, fallbackDateKey = null, formatDate = (value) => String(value || '')) {
  if (!meta) return null;

  const rows = [];
  const movedSourceDate = meta.movedFrom || meta.originalScheduledDate || fallbackDateKey || null;
  if (meta.lifecycle?.isMoved) {
    rows.push(movedSourceDate ? `Moved from ${formatDate(movedSourceDate)}` : 'Moved');
  }
  if (meta.currentScheduledDate && meta.currentScheduledDate !== fallbackDateKey) {
    rows.push(`Now ${formatDate(meta.currentScheduledDate)}`);
  }
  if (meta.lifecycle?.isSkipped) {
    rows.push(meta.skipReason ? `Skipped · ${meta.skipReason}` : 'Skipped');
  }

  return rows.length > 0 ? rows.join(' · ') : null;
}

export function applySkippedGeneratedSessionMeta(workout, {
  skipReason = null,
  lifecycleStatus = 'skipped',
} = {}) {
  const existingMeta = readExistingMeta(workout);
  const originalScheduledDate = existingMeta.originalScheduledDate
    || workout?.plannedDate
    || workout?.scheduledDate
    || null;
  const currentScheduledDate = existingMeta.currentScheduledDate
    || workout?.scheduledDate
    || workout?.plannedDate
    || null;

  return {
    ...workout,
    generatedSessionMeta: {
      originalScheduledDate,
      currentScheduledDate,
      movedFrom: existingMeta.movedFrom || null,
      movedTo: existingMeta.movedTo || null,
      skipStatus: 'skipped',
      skipReason,
      wasSkipped: true,
      generationSource: resolveGenerationSource(workout, existingMeta),
      lifecycle: {
        status: lifecycleStatus,
        isMoved: existingMeta.lifecycle?.isMoved === true || Boolean(existingMeta.movedFrom || existingMeta.movedTo),
        isRescheduled: existingMeta.lifecycle?.isRescheduled === true || Boolean(existingMeta.movedTo),
        isSkipped: true,
      },
    },
  };
}

export function applyMovedGeneratedSessionMeta(workout, {
  originalScheduledDate = null,
  nextScheduledDate = null,
  lifecycleStatus = 'planned',
} = {}) {
  const existingMeta = readExistingMeta(workout);
  const resolvedOriginalScheduledDate = existingMeta.originalScheduledDate
    || originalScheduledDate
    || workout?.plannedDate
    || workout?.scheduledDate
    || null;
  const resolvedCurrentScheduledDate = nextScheduledDate
    || workout?.scheduledDate
    || existingMeta.currentScheduledDate
    || workout?.plannedDate
    || null;

  return {
    ...workout,
    generatedSessionMeta: {
      originalScheduledDate: resolvedOriginalScheduledDate,
      currentScheduledDate: resolvedCurrentScheduledDate,
      movedFrom: resolvedOriginalScheduledDate,
      movedTo: resolvedCurrentScheduledDate,
      skipStatus: existingMeta.skipStatus || 'not_skipped',
      skipReason: existingMeta.skipReason || null,
      wasSkipped: existingMeta.wasSkipped === true,
      generationSource: resolveGenerationSource(workout, existingMeta),
      lifecycle: {
        status: lifecycleStatus,
        isMoved: true,
        isRescheduled: true,
        isSkipped: existingMeta.lifecycle?.isSkipped === true || existingMeta.skipStatus === 'skipped',
      },
    },
  };
}
