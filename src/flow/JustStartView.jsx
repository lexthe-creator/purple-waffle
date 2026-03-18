import React from 'react';

const CATEGORY_COLOR = {
  mindset: { bg: '#E6EBF2', text: '#2F3E5C' },
  admin:   { bg: '#FEF3C7', text: '#92400E' },
  focus:   { bg: '#DCFCE7', text: '#166534' },
  body:    { bg: '#FCE7F3', text: '#9D174D' },
  rest:    { bg: '#F3F4F6', text: '#374151' },
  leisure: { bg: '#EDE9FE', text: '#5B21B6' },
  social:  { bg: '#DBEAFE', text: '#1E40AF' },
  home:    { bg: '#FEF9C3', text: '#854D0E' },
  food:    { bg: '#FFEDD5', text: '#9A3412' },
  planning:{ bg: '#CFFAFE', text: '#155E75' },
};

function CategoryPill({ category }) {
  const colors = CATEGORY_COLOR[category] ?? { bg: '#EEF2F5', text: '#6B7280' };
  return (
    <span style={{ ...S.pill, background: colors.bg, color: colors.text }}>
      {category}
    </span>
  );
}

export function JustStartView({ task, currentIndex, totalTasks, mode, event, onStart, onSkip, onSwap }) {
  if (!task) {
    return (
      <div style={S.wrap}>
        <div style={S.doneBadge}>All done</div>
        <div style={S.doneMsg}>You've moved through everything for today. Well done.</div>
      </div>
    );
  }

  const modeBar = mode === 'event'
    ? { label: `In event: ${event?.title ?? 'Meeting'}`, color: '#2F3E5C', bg: '#E6EBF2' }
    : mode === 'pre-event'
    ? { label: `Starting soon: ${event?.title ?? 'Event'}`, color: '#92400E', bg: '#FEF3C7' }
    : null;

  return (
    <div style={S.wrap}>
      {modeBar && (
        <div style={{ ...S.modeBar, background: modeBar.bg, color: modeBar.color }}>
          {modeBar.label}
        </div>
      )}

      <div style={S.progress}>
        {currentIndex + 1} / {totalTasks}
      </div>

      <div style={S.card}>
        <CategoryPill category={task.category} />
        <div style={S.taskTitle}>{task.title}</div>
        {task.duration && (
          <div style={S.duration}>{task.duration} min</div>
        )}
      </div>

      <div style={S.actions}>
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={onStart}>
          Start
        </button>
        <div style={S.secondaryRow}>
          <button style={{ ...S.btn, ...S.btnGhost }} onClick={onSwap}>
            Swap
          </button>
          <button style={{ ...S.btn, ...S.btnGhost }} onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  wrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 20px 40px',
    gap: 20,
    minHeight: 0,
  },
  modeBar: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    textAlign: 'center',
  },
  progress: {
    fontSize: 12,
    fontWeight: 600,
    color: '#6B7280',
    letterSpacing: '0.5px',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    background: '#fff',
    border: '1px solid #E2E6EA',
    borderRadius: 20,
    padding: '24px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    boxShadow: '0 10px 24px rgba(31,41,51,0.08)',
  },
  pill: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 999,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    alignSelf: 'flex-start',
  },
  taskTitle: {
    fontSize: 24,
    fontWeight: 800,
    color: '#1F2933',
    lineHeight: 1.2,
  },
  duration: {
    fontSize: 13,
    color: '#6B7280',
  },
  actions: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  secondaryRow: {
    display: 'flex',
    gap: 10,
  },
  btn: {
    flex: 1,
    padding: '14px',
    borderRadius: 14,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    textAlign: 'center',
  },
  btnPrimary: {
    background: '#2F3E5C',
    color: '#fff',
  },
  btnGhost: {
    background: '#EEF2F5',
    color: '#1F2933',
    border: '1px solid #E2E6EA',
  },
  doneBadge: {
    fontSize: 13,
    fontWeight: 700,
    color: '#A5B38C',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
  },
  doneMsg: {
    fontSize: 18,
    fontWeight: 600,
    color: '#1F2933',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 1.4,
  },
};
