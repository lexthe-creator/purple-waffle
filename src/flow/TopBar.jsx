import React, { useState, useEffect } from 'react';

function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatEventTime(ms) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function TopBar({ nextEvent, onClose }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const minsUntil = nextEvent
    ? Math.round((nextEvent.startTime - now.getTime()) / 60_000)
    : null;

  return (
    <div style={S.bar}>
      <div style={S.time}>{formatTime(now)}</div>

      {nextEvent ? (
        <div style={S.event}>
          <span style={S.dot} />
          <span style={S.eventText}>
            {nextEvent.title}
            {minsUntil != null && minsUntil > 0 && (
              <span style={S.when}> · {minsUntil < 60 ? `${minsUntil}m` : `${formatEventTime(nextEvent.startTime)}`}</span>
            )}
          </span>
        </div>
      ) : (
        <div style={S.freeText}>No events</div>
      )}

      {onClose && (
        <button style={S.closeBtn} onClick={onClose} aria-label="Close flow">
          ✕
        </button>
      )}
    </div>
  );
}

const S = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    background: 'rgba(246,243,239,0.96)',
    borderBottom: '1px solid #E2E6EA',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  time: {
    fontSize: 15,
    fontWeight: 700,
    color: '#1F2933',
    flexShrink: 0,
  },
  event: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#2F3E5C',
    flexShrink: 0,
  },
  eventText: {
    fontSize: 13,
    color: '#1F2933',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  when: {
    color: '#6B7280',
  },
  freeText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    color: '#6B7280',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: 8,
    flexShrink: 0,
  },
};
