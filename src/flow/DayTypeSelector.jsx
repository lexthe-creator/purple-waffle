import React from 'react';

const DAY_TYPES = [
  {
    id: 'work',
    label: 'Work day',
    description: 'Deep focus, deliverables, meetings',
    icon: '💼',
  },
  {
    id: 'low_energy',
    label: 'Low energy',
    description: 'Light tasks, rest, gentle momentum',
    icon: '🌤',
  },
  {
    id: 'off',
    label: 'Day off',
    description: 'Leisure, rest, no obligations',
    icon: '🌿',
  },
  {
    id: 'reset',
    label: 'Reset day',
    description: 'Admin, planning, declutter',
    icon: '🔄',
  },
];

export function DayTypeSelector({ onSelect }) {
  return (
    <div style={S.overlay}>
      <div style={S.sheet}>
        <div style={S.heading}>What kind of day is it?</div>
        <div style={S.sub}>Your answer shapes the whole flow.</div>
        <div style={S.grid}>
          {DAY_TYPES.map(type => (
            <button
              key={type.id}
              style={S.card}
              onClick={() => onSelect(type.id)}
            >
              <span style={S.icon}>{type.icon}</span>
              <span style={S.label}>{type.label}</span>
              <span style={S.desc}>{type.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(31,41,51,0.6)',
    zIndex: 700,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    background: '#fff',
    borderRadius: '24px 24px 0 0',
    padding: '28px 20px 36px',
  },
  heading: {
    fontSize: 22,
    fontWeight: 800,
    color: '#1F2933',
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
    padding: '14px 14px',
    background: '#F6F3EF',
    border: '1.5px solid #E2E6EA',
    borderRadius: 16,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s',
  },
  icon: {
    fontSize: 22,
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1F2933',
  },
  desc: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 1.35,
  },
};
