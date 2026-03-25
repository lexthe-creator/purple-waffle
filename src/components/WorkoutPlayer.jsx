import React, { useMemo } from 'react';
import { getWorkoutPlayerModel } from './workoutPlayerModel.js';

export default function WorkoutPlayer({
  workout,
  onCancel = () => {},
  onComplete = () => {},
  onLogCompletion = () => {},
}) {
  const player = useMemo(() => getWorkoutPlayerModel(workout), [workout]);

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
        </div>
      </div>

      <section style={playerSectionStyle}>
        <div style={sectionLabelStyle}>WARM-UP</div>
        <div style={stepListStyle}>
          {player.warmupSteps.length > 0 ? player.warmupSteps.map((step, index) => (
            <div key={`warmup-${index}`} style={stepRowStyle}>
              <span style={stepNameStyle}>{step.label}</span>
              <span style={stepValueStyle}>{step.value || '—'}</span>
            </div>
          )) : (
            <div style={emptyStepRowStyle}>
              <span style={stepNameStyle}>Warm-up not structured yet</span>
              <span style={stepValueStyle}>—</span>
            </div>
          )}
        </div>
      </section>

      <button type="button" style={logCompletionButtonStyle} onClick={onLogCompletion}>
        LOG COMPLETION
      </button>

      <section style={playerSectionStyle}>
        <div style={sectionLabelStyle}>COOLDOWN</div>
        <div style={stepListStyle}>
          {player.cooldownSteps.length > 0 ? player.cooldownSteps.map((step, index) => (
            <div key={`cooldown-${index}`} style={stepRowStyle}>
              <span style={stepNameStyle}>{step.label}</span>
              <span style={stepValueStyle}>{step.value || '—'}</span>
            </div>
          )) : (
            <div style={emptyStepRowStyle}>
              <span style={stepNameStyle}>Cooldown not structured yet</span>
              <span style={stepValueStyle}>—</span>
            </div>
          )}
        </div>
      </section>

      <div style={bottomActionWrapStyle}>
        <button type="button" style={primaryActionStyle} onClick={() => onComplete({ workoutId: workout.id, completedAt: Date.now() })}>
          {player.completeLabel}
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
