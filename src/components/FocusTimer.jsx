import React, { useEffect, useRef, useState } from 'react';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const PRESET_DURATIONS = [
  { label: '15m', minutes: 15 },
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '60m', minutes: 60 },
];

export default function FocusTimer({ session, onStart, onStop, onDismiss }) {
  const { active, taskLabel, durationMinutes, startedAt } = session;
  const [elapsed, setElapsed] = useState(0);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDuration, setDraftDuration] = useState(25);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed(0);
      return;
    }
    function tick() {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }
    tick();
    intervalRef.current = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalRef.current);
  }, [active, startedAt]);

  const totalSeconds = durationMinutes * 60;
  const activeTotal = active ? durationMinutes * 60 : draftDuration * 60;
  const progressSeconds = active ? elapsed : 0;
  const remaining = Math.max(0, activeTotal - progressSeconds);
  const progress = activeTotal > 0 ? Math.min(1, progressSeconds / activeTotal) : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  const remainingMins = Math.floor(remaining / 60);
  const remainingSecs = remaining % 60;
  const timeDisplay = `${String(remainingMins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;

  const isFinished = active && remaining === 0;

  if (!active) {
    return (
      <div className="focus-timer focus-timer--idle">
        <div className="focus-timer__ring-wrap">
          <svg className="focus-timer__svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="focus-timer__track" cx="60" cy="60" r={RADIUS} />
            <circle
              className="focus-timer__progress"
              cx="60"
              cy="60"
              r={RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE}
              transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="focus-timer__center">
            <span className="focus-timer__time">{String(draftDuration).padStart(2, '0')}:00</span>
            <span className="focus-timer__label-idle">ready</span>
          </div>
        </div>

        <div className="focus-timer__setup">
          <input
            className="focus-timer__task-input"
            type="text"
            placeholder="What are you focusing on?"
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            maxLength={80}
          />
          <div className="focus-timer__presets">
            {PRESET_DURATIONS.map(p => (
              <button
                key={p.minutes}
                type="button"
                className={`status-chip${draftDuration === p.minutes ? ' is-active' : ''}`}
                onClick={() => setDraftDuration(p.minutes)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={() => onStart({ taskLabel: draftLabel, durationMinutes: draftDuration })}
          >
            Start focus
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="focus-timer focus-timer--active">
      <div className="focus-timer__ring-wrap">
        <svg className="focus-timer__svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="focus-timer__track" cx="60" cy="60" r={RADIUS} />
          <circle
            className={`focus-timer__progress${isFinished ? ' focus-timer__progress--done' : ''}`}
            cx="60"
            cy="60"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="focus-timer__center">
          <span className="focus-timer__time">{isFinished ? 'Done' : timeDisplay}</span>
          {taskLabel && <span className="focus-timer__task-running">{taskLabel}</span>}
        </div>
      </div>

      <div className="focus-timer__controls">
        {isFinished ? (
          <>
            <p className="focus-timer__finish-msg">Session complete. Nice work.</p>
            <button type="button" className="primary-button" onClick={onDismiss}>
              Finish
            </button>
          </>
        ) : (
          <button type="button" className="ghost-button" onClick={onStop}>
            End session
          </button>
        )}
      </div>
    </div>
  );
}
