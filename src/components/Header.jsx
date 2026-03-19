import React from 'react';

function HeaderIcon({ path, color }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function Header({
  C,
  S,
  greeting,
  name,
  dateLabel,
  dateTitle,
  inboxCount,
  onOpenCalendar,
  onOpenInbox,
  onOpenBrainDump,
}) {
  return (
    <div style={S.hdr}>
      <div>
        <div style={{ ...S.micro, fontWeight: 400 }}>
          {greeting}, {name}
        </div>
        <button
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            marginTop: 1,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 400,
            color: C.muted,
            opacity: 0.66,
            lineHeight: 1.25,
            textAlign: 'left',
          }}
          title={dateTitle}
          onClick={onOpenCalendar}
        >
          {dateLabel}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          style={{ background: C.surf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', position: 'relative' }}
          onClick={onOpenInbox}
          title="Inbox"
          aria-label={inboxCount > 0 ? `Inbox, ${inboxCount} pending item${inboxCount !== 1 ? 's' : ''}` : 'Inbox'}
        >
          {inboxCount > 0 && (
            <div style={{ position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 999, background: C.red, color: C.white, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
              {Math.min(inboxCount, 9)}
            </div>
          )}
          <HeaderIcon color={C.muted} path="M19 3H4.99C3.88 3 3 3.9 3 5l.01 14c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12h-4c0 1.66-1.34 3-3 3s-3-1.34-3-3H5V5h14v10z" />
        </button>
        <button
          style={{ background: C.surf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onClick={onOpenBrainDump}
          title="Brain Dump"
          aria-label="Open brain dump"
        >
          <HeaderIcon color={C.navy} path="M11.5 2C8.46 2 6 4.46 6 7.5c0 .42.05.83.14 1.22C4.25 9.56 3 11.38 3 13.5 3 16.54 5.46 19 8.5 19H9v3l3.86-3H15.5c3.59 0 6.5-2.91 6.5-6.5 0-2.82-1.8-5.21-4.31-6.1A6.5 6.5 0 0 0 11.5 2zm-2 5.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm4 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-2 6.1c-1.19 0-2.28-.53-3.03-1.44l1.06-.88c.5.6 1.21.95 1.97.95s1.47-.35 1.97-.95l1.06.88c-.75.91-1.84 1.44-3.03 1.44z" />
        </button>
      </div>
    </div>
  );
}
