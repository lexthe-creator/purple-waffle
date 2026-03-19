import React, { useState, useEffect, useRef } from 'react';

export default function WorkoutPlayer({ C, S, wkSess, onComplete, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const [completedSets, setCompletedSets] = useState({});
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const exercises = wkSess?.ex || [];
  const totalSets = exercises.reduce((sum, ex) => sum + (Number(ex.sets) || 3), 0);
  const doneSets = Object.values(completedSets).filter(Boolean).length;
  const progress = totalSets > 0 ? Math.min(1, doneSets / totalSets) : 0;

  function toggleSet(exIdx, setIdx) {
    const key = `${exIdx}-${setIdx}`;
    setCompletedSets(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const warmup = wkSess?.warmup || [];
  const cooldown = wkSess?.cooldown || [];

  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, zIndex: 800, display: 'flex', flexDirection: 'column', maxWidth: 430, margin: '0 auto', left: '50%', transform: 'translateX(-50%)', width: '100%' }}>
      {/* Sticky header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${C.bd}`, background: C.card, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted, marginBottom: 3 }}>Active workout</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.tx, lineHeight: 1.1 }}>{wkSess?.name || 'Workout'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.navy, letterSpacing: '-1px', lineHeight: 1 }}>
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{doneSets}/{totalSets} sets</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: C.surf, borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${progress * 100}%`, height: '100%', background: C.sage, borderRadius: 99, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Scrollable exercise list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', paddingBottom: 100 }}>
        {warmup.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Warm-up</div>
            {warmup.map((item, i) => (
              <div key={i} style={{ background: C.surf, borderRadius: 10, padding: '8px 12px', marginBottom: 6, fontSize: 13, color: C.tx }}>
                {item.name || item.n || `Warm-up ${i + 1}`}{item.duration ? ` — ${item.duration} min` : ''}
              </div>
            ))}
          </div>
        )}

        {exercises.length === 0 && (
          <div style={{ background: C.surf, borderRadius: 12, padding: '24px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: C.muted }}>No exercises loaded.</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Tap Complete when you&apos;re done.</div>
          </div>
        )}

        {exercises.map((ex, exIdx) => {
          const setCount = Number(ex.sets) || 3;
          const reps = ex.reps || ex.rep || 10;
          const weight = ex.weight || ex.wt || null;
          const exName = ex.n || ex.name || `Exercise ${exIdx + 1}`;
          const exDone = Array.from({ length: setCount }, (_, si) => !!completedSets[`${exIdx}-${si}`]).every(Boolean);

          return (
            <div key={exIdx} style={{ background: C.card, border: `1px solid ${exDone ? C.sage : C.bd}`, borderRadius: 14, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: exDone ? C.sageDk : C.tx, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {exName}
                {exDone && <span style={{ fontSize: 11, fontWeight: 700, color: C.sageDk }}>✓ Done</span>}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {Array.from({ length: setCount }, (_, setIdx) => {
                  const key = `${exIdx}-${setIdx}`;
                  const done = !!completedSets[key];
                  return (
                    <button
                      key={setIdx}
                      type="button"
                      onClick={() => toggleSet(exIdx, setIdx)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${done ? C.sage : C.bd}`, background: done ? C.sageL : C.bg, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    >
                      <div style={{ width: 20, height: 20, borderRadius: 999, border: `1.5px solid ${done ? C.sage : C.bd}`, background: done ? C.sage : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {done && <span style={{ color: C.white, fontSize: 10, fontWeight: 700 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: done ? C.sageDk : C.tx, fontWeight: 600 }}>
                        Set {setIdx + 1}
                        <span style={{ fontWeight: 400, color: C.muted }}> — {reps} reps{weight ? ` @ ${weight}` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {cooldown.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: C.muted, marginBottom: 8 }}>Cool-down</div>
            {cooldown.map((item, i) => (
              <div key={i} style={{ background: C.surf, borderRadius: 10, padding: '8px 12px', marginBottom: 6, fontSize: 13, color: C.tx }}>
                {item.name || item.n || `Cool-down ${i + 1}`}{item.duration ? ` — ${item.duration} min` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed footer controls */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px 32px', borderTop: `1px solid ${C.bd}`, background: C.card, display: 'flex', gap: 10 }}>
        <button type="button" onClick={onCancel} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
        <button type="button" onClick={() => onComplete(elapsed)} style={{ ...S.btnSolid(), flex: 2 }}>Complete Workout</button>
      </div>
    </div>
  );
}
