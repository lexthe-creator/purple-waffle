import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getWorkoutPlayerModel } from './workoutPlayerModel.js';

export default function WorkoutPlayer({
  workout,
  onCancel = () => {},
  onComplete = () => {},
  onLogCompletion = () => {},
  onUpdateWorkoutLog = () => {},
}) {
  const player = useMemo(() => getWorkoutPlayerModel(workout), [workout]);
  const autoCompleteRef = useRef(null);
  const [sessionNotes, setSessionNotes] = useState(() => workout?.workoutLog?.notes || '');

  useEffect(() => {
    setSessionNotes(workout?.workoutLog?.notes || '');
  }, [workout?.id, workout?.workoutLog?.notes]);

  const segmentLogMap = useMemo(() => {
    const segments = Array.isArray(workout?.workoutLog?.segments) ? workout.workoutLog.segments : [];
    return new Map(segments.map(segment => [segment.id, segment]));
  }, [workout?.workoutLog?.segments]);

  const firstIncompleteIndex = useMemo(
    () => player.segments.findIndex(segment => segmentLogMap.get(segment.id)?.completed !== true),
    [player.segments, segmentLogMap],
  );

  const activeSegmentIndex = useMemo(() => {
    if (player.segments.length === 0) return 0;

    const currentSegmentId = workout?.workoutLog?.currentSegmentId;
    const currentSegmentIndex = Number.isFinite(workout?.workoutLog?.currentSegmentIndex)
      ? workout.workoutLog.currentSegmentIndex
      : null;

    if (typeof currentSegmentId === 'string') {
      const matchedIndex = player.segments.findIndex(segment => segment.id === currentSegmentId);
      if (matchedIndex >= 0) return matchedIndex;
    }

    if (currentSegmentIndex !== null && currentSegmentIndex >= 0 && currentSegmentIndex < player.segments.length) {
      return currentSegmentIndex;
    }

    return firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0;
  }, [firstIncompleteIndex, player.segments, workout?.workoutLog?.currentSegmentId, workout?.workoutLog?.currentSegmentIndex]);

  const activeSegment = player.segments[activeSegmentIndex] ?? null;
  const completedCount = useMemo(
    () => player.segments.filter(segment => segmentLogMap.get(segment.id)?.completed === true).length,
    [player.segments, segmentLogMap],
  );
  const allSegmentsComplete = player.segments.length > 0 && completedCount === player.segments.length;
  const completionProgressLabel = `${completedCount}/${player.segments.length || 0} complete`;
  const currentSegmentDone = activeSegment ? segmentLogMap.get(activeSegment.id)?.completed === true : false;

  function buildSegmentLog(segment, completed) {
    const existing = segmentLogMap.get(segment.id) || {};
    const now = Date.now();

    return {
      id: segment.id,
      blockId: segment.blockId,
      exerciseId: segment.exerciseId,
      label: segment.title,
      completed,
      completedAt: completed ? (existing.completedAt || now) : null,
      source: 'manual',
      note: existing.note || null,
      metrics: {
        ...(existing.metrics || {}),
      },
    };
  }

  function buildCompletionLog({ completeRemainingSegments = false, completionSource = 'manual_completion' } = {}) {
    const now = Date.now();
    const segments = player.segments.map(segment => {
      const existing = segmentLogMap.get(segment.id) || null;
      if (existing?.completed) return existing;
      if (!completeRemainingSegments) return buildSegmentLog(segment, false);
      return buildSegmentLog(segment, true);
    });

    return {
      source: 'manual',
      startedAt: workout?.startedAt || workout?.workoutLog?.startedAt || now,
      lastUpdatedAt: now,
      completionLoggedAt: now,
      completionSource,
      notes: sessionNotes,
      currentSegmentId: activeSegment?.id || null,
      currentSegmentIndex: activeSegmentIndex,
      segments,
      externalRefs: workout?.workoutLog?.externalRefs || {},
    };
  }

  function syncWorkoutLog(patch = {}) {
    onUpdateWorkoutLog({
      ...patch,
      notes: Object.prototype.hasOwnProperty.call(patch, 'notes') ? patch.notes : sessionNotes,
      lastUpdatedAt: Date.now(),
    });
  }

  function handleSelectSegment(index) {
    const selected = player.segments[index];
    if (!selected) return;
    syncWorkoutLog({
      currentSegmentId: selected.id,
      currentSegmentIndex: index,
    });
  }

  function handleToggleSegment(segment) {
    if (!segment) return;
    const currentlyCompleted = segmentLogMap.get(segment.id)?.completed === true;
    const nextCompleted = !currentlyCompleted;
    const now = Date.now();
    const nextIndex = nextCompleted
      ? player.segments.findIndex((candidate, index) => index > activeSegmentIndex && segmentLogMap.get(candidate.id)?.completed !== true)
      : activeSegmentIndex;

    syncWorkoutLog({
      segment: {
        ...buildSegmentLog(segment, nextCompleted),
        completedAt: nextCompleted ? now : null,
      },
      currentSegmentId: nextIndex >= 0 ? player.segments[nextIndex]?.id || segment.id : segment.id,
      currentSegmentIndex: nextIndex >= 0 ? nextIndex : activeSegmentIndex,
    });
  }

  function handleProgressNotesChange(event) {
    const nextValue = event.target.value;
    setSessionNotes(nextValue);
    syncWorkoutLog({ notes: nextValue });
  }

  function handleLogCompletion() {
    const payload = buildCompletionLog({
      completeRemainingSegments: true,
      completionSource: 'manual_log_completion',
    });
    onLogCompletion(payload);
  }

  function handlePrimaryAction() {
    if (!activeSegment) {
      onComplete(buildCompletionLog({
        completeRemainingSegments: false,
        completionSource: 'manual_completion',
      }));
      return;
    }

    if (!currentSegmentDone) {
      handleToggleSegment(activeSegment);
      return;
    }

    const nextIncompleteIndex = player.segments.findIndex((segment, index) => index > activeSegmentIndex && segmentLogMap.get(segment.id)?.completed !== true);
    if (nextIncompleteIndex >= 0) {
      handleSelectSegment(nextIncompleteIndex);
      return;
    }

    onComplete(buildCompletionLog({
      completeRemainingSegments: false,
      completionSource: 'segment_logging',
    }));
  }

  useEffect(() => {
    if (!allSegmentsComplete || workout?.status === 'completed') {
      autoCompleteRef.current = null;
      return;
    }

    if (autoCompleteRef.current === workout.id) return;
    autoCompleteRef.current = workout.id;

    onComplete(buildCompletionLog({
      completeRemainingSegments: false,
      completionSource: 'segment_logging',
    }));
  }, [allSegmentsComplete, onComplete, workout?.id, workout?.status]);

  const primaryActionLabel = !activeSegment
    ? player.completeLabel
    : !currentSegmentDone
      ? 'Mark Segment Done'
      : allSegmentsComplete
        ? player.completeLabel
        : 'Next Segment';

  if (!workout) return null;

  return (
    <div style={playerPageStyle}>
      <div style={playerHeaderStyle}>
        <div style={playerPageTitleStyle}>Fitness</div>

        <div style={playerTopRowStyle}>
          <div style={playerTopCopyStyle}>
            <div style={playerWorkoutTypeStyle}>{player.typeLabel}</div>
            <div style={playerWorkoutTitleStyle}>{player.title}</div>
          </div>

          <button type="button" style={cancelButtonStyle} onClick={onCancel}>
            Cancel
          </button>
        </div>

        <div style={playerCoachingTextStyle}>{player.coachingNote}</div>

	        <div style={playerMetaStackStyle}>
	          {player.summaryLine1 ? (
	            <div style={playerMetaLineStyle}>{player.summaryLine1}</div>
          ) : null}
	          {player.summaryLine2 ? (
	            <div style={playerMetaLineStyle}>{player.summaryLine2}</div>
	          ) : null}
            <div style={playerMetaLineStyle}>{completionProgressLabel}</div>
	        </div>
	      </div>

	      <section style={playerSectionStyle}>
	        <div style={sectionLabelStyle}>CURRENT SEGMENT</div>
          {activeSegment ? (
            <div style={currentSegmentCardStyle}>
              {activeSegment.blockTitle ? (
                <div style={currentSegmentEyebrowStyle}>{activeSegment.blockTitle}</div>
              ) : null}
              <div style={currentSegmentTitleStyle}>{activeSegment.title}</div>
              {activeSegment.detail ? (
                <div style={currentSegmentDetailStyle}>{activeSegment.detail}</div>
              ) : null}
              {activeSegment.meta ? (
                <div style={currentSegmentMetaStyle}>{activeSegment.meta}</div>
              ) : null}
              {activeSegment.note ? (
                <div style={currentSegmentNoteStyle}>{activeSegment.note}</div>
              ) : null}
              <div style={currentSegmentActionsStyle}>
                <button
                  type="button"
                  style={secondaryActionStyle}
                  onClick={() => handleSelectSegment(Math.max(0, activeSegmentIndex - 1))}
                  disabled={activeSegmentIndex === 0}
                >
                  Previous
                </button>
                <button
                  type="button"
                  style={segmentDoneButtonStyle(segmentLogMap.get(activeSegment.id)?.completed === true)}
                  onClick={() => handleToggleSegment(activeSegment)}
                >
                  {segmentLogMap.get(activeSegment.id)?.completed === true ? 'Completed' : 'Mark done'}
                </button>
              </div>
            </div>
          ) : (
            <div style={emptyStepRowStyle}>
              <span style={stepNameStyle}>Workout segments are not structured yet</span>
              <span style={stepValueStyle}>—</span>
            </div>
          )}
	      </section>

	      <button type="button" style={logCompletionButtonStyle} onClick={handleLogCompletion}>
	        LOG COMPLETION
	      </button>

	      <section style={playerSectionStyle}>
	        <div style={sectionLabelStyle}>WORKOUT FLOW</div>
	        <div style={stepListStyle}>
	          {player.segments.length > 0 ? player.segments.map((segment, index) => {
              const isCompleted = segmentLogMap.get(segment.id)?.completed === true;
              const isActive = index === activeSegmentIndex;

              return (
                <button
                  key={segment.id}
                  type="button"
                  style={segmentRowStyle(isActive)}
                  onClick={() => handleSelectSegment(index)}
                >
                  <div style={segmentRowCopyStyle}>
                    <span style={segmentRowTitleStyle}>{segment.title}</span>
                    {segment.meta ? (
                      <span style={segmentRowMetaStyle}>{segment.meta}</span>
                    ) : null}
                  </div>
                  <span style={segmentStatusStyle(isCompleted)}>
                    {isCompleted ? 'Done' : `${index + 1}`}
                  </span>
                </button>
              );
            }) : (
	            <div style={emptyStepRowStyle}>
	              <span style={stepNameStyle}>Workout flow not structured yet</span>
	              <span style={stepValueStyle}>—</span>
	            </div>
	          )}
	        </div>
	      </section>

      <section style={playerSectionStyle}>
        <div style={sectionLabelStyle}>WORKOUT NOTES</div>
        <textarea
          value={sessionNotes}
          onChange={handleProgressNotesChange}
          placeholder="Optional workout note"
          style={notesFieldStyle}
        />
      </section>

	      <div style={bottomActionWrapStyle}>
	        <button type="button" style={primaryActionStyle} onClick={handlePrimaryAction}>
	          {primaryActionLabel}
	        </button>
	      </div>
	    </div>
  );
}

const playerPageStyle = {
  minHeight: '100%',
  padding: 16,
  paddingBottom: 104,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  background:
    'radial-gradient(circle at top left, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, var(--bg) 0%, rgba(255, 255, 255, 0.38) 100%)',
};

const playerHeaderStyle = {
  padding: 18,
  borderRadius: 24,
  border: '1px solid var(--border-card)',
  background: 'var(--card)',
  boxShadow: 'var(--shadow)',
};

const playerPageTitleStyle = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 16,
};

const playerTopRowStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};

const playerTopCopyStyle = {
  minWidth: 0,
  flex: 1,
};

const playerWorkoutTypeStyle = {
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
};

const playerWorkoutTitleStyle = {
  fontSize: 28,
  lineHeight: 1.08,
  fontWeight: 750,
  letterSpacing: '-0.03em',
  color: 'var(--text)',
};

const cancelButtonStyle = {
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  cursor: 'pointer',
  padding: '10px 0 0',
  fontSize: 15,
  fontWeight: 600,
};

const playerCoachingTextStyle = {
  marginTop: 14,
  fontSize: 15,
  lineHeight: 1.5,
  color: 'var(--text)',
};

const playerMetaStackStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 12,
};

const playerMetaLineStyle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--muted)',
};

const playerSectionStyle = {
  borderRadius: 20,
  border: '1px solid var(--border-card)',
  background: 'var(--card)',
  padding: 16,
  boxShadow: 'var(--shadow-xs)',
};

const sectionLabelStyle = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.11em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 12,
};

const stepListStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const stepRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '11px 0',
  borderTop: '1px solid var(--border-divider)',
};

const emptyStepRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '11px 0',
  borderTop: '1px solid var(--border-divider)',
  color: 'var(--muted)',
};

const stepNameStyle = {
  fontSize: 15,
  lineHeight: 1.35,
  color: 'var(--text)',
  minWidth: 0,
};

const stepValueStyle = {
  fontSize: 14,
  lineHeight: 1.35,
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

const logCompletionButtonStyle = {
  alignSelf: 'flex-start',
  border: '1px solid var(--border-card)',
  background: 'rgba(255, 255, 255, 0.78)',
  color: 'var(--text)',
  borderRadius: 999,
  padding: '10px 14px',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  boxShadow: 'var(--shadow-xs)',
};

const currentSegmentCardStyle = {
  display: 'grid',
  gap: 10,
};

const currentSegmentEyebrowStyle = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
};

const currentSegmentTitleStyle = {
  fontSize: 22,
  lineHeight: 1.12,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--text)',
};

const currentSegmentDetailStyle = {
  fontSize: 15,
  lineHeight: 1.45,
  color: 'var(--text)',
};

const currentSegmentMetaStyle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--muted)',
};

const currentSegmentNoteStyle = {
  fontSize: 13,
  lineHeight: 1.45,
  color: 'var(--muted)',
};

const currentSegmentActionsStyle = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const secondaryActionStyle = {
  border: '1px solid var(--border-card)',
  background: 'transparent',
  color: 'var(--text)',
  borderRadius: 14,
  padding: '10px 14px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

const segmentDoneButtonStyle = completed => ({
  border: '1px solid transparent',
  background: completed ? 'rgba(165, 179, 140, 0.18)' : 'var(--primary-soft)',
  color: completed ? 'var(--success-text)' : 'var(--text)',
  borderRadius: 14,
  padding: '10px 14px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
});

const segmentRowStyle = isActive => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  padding: '11px 0',
  borderTop: '1px solid var(--border-divider)',
  background: 'transparent',
  borderLeft: 'none',
  borderRight: 'none',
  borderBottom: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  borderRadius: 0,
  outline: 'none',
  boxShadow: 'none',
  opacity: isActive ? 1 : 0.94,
});

const segmentRowCopyStyle = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
};

const segmentRowTitleStyle = {
  fontSize: 15,
  lineHeight: 1.35,
  color: 'var(--text)',
};

const segmentRowMetaStyle = {
  fontSize: 13,
  lineHeight: 1.4,
  color: 'var(--muted)',
};

const segmentStatusStyle = completed => ({
  minWidth: 34,
  height: 34,
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: completed ? 'rgba(165, 179, 140, 0.18)' : 'var(--surface)',
  border: `1px solid ${completed ? 'rgba(165, 179, 140, 0.35)' : 'var(--border-card)'}`,
  color: completed ? 'var(--success-text)' : 'var(--muted)',
  fontSize: 12,
  fontWeight: 800,
  flexShrink: 0,
});

const notesFieldStyle = {
  width: '100%',
  minHeight: 92,
  resize: 'vertical',
  borderRadius: 16,
  border: '1px solid var(--border-card)',
  background: 'rgba(255, 255, 255, 0.78)',
  padding: 12,
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--text)',
};

const bottomActionWrapStyle = {
  position: 'sticky',
  bottom: 0,
  marginTop: 'auto',
  paddingTop: 16,
  background: 'linear-gradient(to top, var(--bg) 72%, rgba(246, 243, 239, 0))',
};

const primaryActionStyle = {
  width: '100%',
  border: 'none',
  borderRadius: 18,
  padding: '15px 16px',
  background: 'var(--primary)',
  color: 'var(--card)',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-strong)',
};
