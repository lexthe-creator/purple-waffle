import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext.jsx';
import { useProfileContext } from '../context/ProfileContext.jsx';

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function MorningCheckinModal() {
  const {
    showMorningCheckin,
    setShowMorningCheckin,
    morningStep,
    setMorningStep,
    energyScore,
    setEnergyScore,
    sleepHours,
    setSleepHours,
    setEnergyState,
    setMorningChecklist,
  } = useAppContext();

  const { setProfile } = useProfileContext();

  // Local top-3 state (3 text inputs)
  const [top3, setTop3] = useState(['', '', '']);

  // Reset step and inputs when modal opens
  useEffect(() => {
    if (showMorningCheckin) {
      setMorningStep(0);
      setTop3(['', '', '']);
    }
  }, [showMorningCheckin, setMorningStep]);

  // Close on Escape
  useEffect(() => {
    if (!showMorningCheckin) return undefined;
    function handleKey(e) {
      if (e.key === 'Escape') setShowMorningCheckin(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showMorningCheckin, setShowMorningCheckin]);

  function finish() {
    // Persist energy + sleep to energyState
    setEnergyState(prev => ({
      ...prev,
      value: energyScore,
      sleepHours,
      sleepSource: 'manual',
      lastCheckIn: new Date().toISOString(),
    }));

    const todayKey = getTodayDateKey();

    // Persist top-3 to profile
    const entries = top3.map(t => t.trim()).filter(Boolean);
    setProfile(p => ({
      ...p,
      top3: { ...p.top3, [todayKey]: entries },
      dailyLogs: {
        ...p.dailyLogs,
        [todayKey]: {
          ...(p.dailyLogs[todayKey] || {}),
          energyScore,
          sleepHours,
          checkInDone: true,
        },
      },
    }));

    // Mark morning check-in checklist item done
    setMorningChecklist(current =>
      current.map(item => item.id === 'mc-1' ? { ...item, done: true } : item),
    );

    // Close modal and reset step
    setMorningStep(0);
    setShowMorningCheckin(false);
  }

  if (!showMorningCheckin) return null;
  if (typeof document === 'undefined') return null;

  const TOTAL_STEPS = 3;

  return createPortal(
    <div className="modal-backdrop" onClick={() => setShowMorningCheckin(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: '420px', width: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="eyebrow">Morning check-in · Step {morningStep + 1} of {TOTAL_STEPS}</p>
            <h2 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>
              {morningStep === 0 && "How's your energy today?"}
              {morningStep === 1 && 'How did you sleep?'}
              {morningStep === 2 && "What are your top 3 priorities?"}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={() => setShowMorningCheckin(false)}
            aria-label="Close morning check-in"
          >
            ×
          </button>
        </div>

        {/* Step 0 — Energy */}
        {morningStep === 0 && (
          <div style={{ padding: '16px 0' }}>
            <div className="status-chip-group" role="group" aria-label="Energy rating">
              {[1, 2, 3, 4, 5].map(v => (
                <button
                  key={v}
                  type="button"
                  className={`status-chip ${energyScore === v ? 'is-active' : ''}`}
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setEnergyScore(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="eyebrow" style={{ marginTop: '8px', textAlign: 'center' }}>
              {energyScore <= 2 ? 'Low — consider a recovery day' : energyScore >= 4 ? 'High — great day to push' : 'Moderate — steady pace'}
            </p>
            <button
              type="button"
              className="primary-button full-width"
              style={{ marginTop: '16px' }}
              onClick={() => setMorningStep(1)}
            >
              Next
            </button>
          </div>
        )}

        {/* Step 1 — Sleep */}
        {morningStep === 1 && (
          <div style={{ padding: '16px 0' }}>
            <div className="field-stack">
              <label htmlFor="sleep-hours-input" style={{ fontSize: 'var(--fs-sm)', color: 'var(--muted)' }}>
                Hours of sleep
              </label>
              <input
                id="sleep-hours-input"
                type="number"
                min="0"
                max="24"
                step="0.5"
                className="brain-dump-input"
                value={sleepHours}
                onChange={e => setSleepHours(Number.parseFloat(e.target.value) || 0)}
              />
            </div>
            <p className="eyebrow" style={{ marginTop: '8px' }}>
              {sleepHours < 6 ? 'Short night — recovery priority' : sleepHours >= 8 ? 'Well rested' : 'Decent sleep'}
            </p>
            <div className="quick-entry-row" style={{ marginTop: '16px' }}>
              <button type="button" className="ghost-button" onClick={() => setMorningStep(0)}>
                Back
              </button>
              <button type="button" className="primary-button" onClick={() => setMorningStep(2)}>
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Top-3 */}
        {morningStep === 2 && (
          <div style={{ padding: '16px 0' }}>
            <div className="field-stack">
              {[0, 1, 2].map(i => (
                <input
                  key={i}
                  className="brain-dump-input"
                  placeholder={`Priority ${i + 1}…`}
                  value={top3[i]}
                  onChange={e => setTop3(current => {
                    const next = [...current];
                    next[i] = e.target.value;
                    return next;
                  })}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && i === 2) { e.preventDefault(); finish(); }
                  }}
                />
              ))}
            </div>
            <div className="quick-entry-row" style={{ marginTop: '16px' }}>
              <button type="button" className="ghost-button" onClick={() => setMorningStep(1)}>
                Back
              </button>
              <button type="button" className="primary-button" onClick={finish}>
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
