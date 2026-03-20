import React, { useEffect, useState } from 'react';

function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toolbar-icon">
      <path d="M4 5.5h16a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Zm0 2V17h16V7.5H4Zm3.5 3h9a1 1 0 1 1 0 2h-9a1 1 0 1 1 0-2Z" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toolbar-icon">
      <path d="M9 3.5a3.5 3.5 0 0 0-3.43 4.21A3.99 3.99 0 0 0 6 15.5h.25A3.75 3.75 0 0 0 10 19.25h1V14H9.75a1 1 0 1 1 0-2H11V9.75H9.75a1 1 0 1 1 0-2H11V3.5H9Zm4 0V8h1.25a1 1 0 1 1 0 2H13V12h1.25a1 1 0 1 1 0 2H13v5.25h1a3.75 3.75 0 0 0 3.75-3.75H18a4 4 0 0 0 .43-7.79A3.5 3.5 0 0 0 15 3.5h-2Z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toolbar-icon">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.2 3.5c0-.36-.03-.7-.09-1.04l2.06-1.61-1.95-3.38-2.5 1a8.02 8.02 0 0 0-1.8-1.04l-.38-2.65H9.46l-.38 2.65c-.64.25-1.24.6-1.8 1.04l-2.5-1-1.95 3.38 2.06 1.61c-.06.34-.09.68-.09 1.04s.03.7.09 1.04L2.83 14.65l1.95 3.38 2.5-1c.56.44 1.16.79 1.8 1.04l.38 2.65h5.88l.38-2.65c.64-.25 1.24-.6 1.8-1.04l2.5 1 1.95-3.38-2.06-1.61c.06-.34.09-.68.09-1.04Z" />
    </svg>
  );
}

export default function Header({ userName, inboxCount, onOpenInbox, onOpenQuickAdd, onOpenSettings }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(now);

  const hour = now.getHours();
  const greeting =
    hour >= 5 && hour < 12 ? 'Good morning' :
    hour >= 12 && hour < 17 ? 'Good afternoon' :
    hour >= 17 && hour < 21 ? 'Good evening' :
    'Good night';

  return (
    <header className="app-header">
      <div className="header-copy">
        <p className="header-date">{dateLabel}</p>
        <h1>
          {greeting}, <span>{userName}</span>
        </h1>
      </div>

      <div className="header-actions" role="toolbar" aria-label="Global actions">
        <button type="button" className="icon-button" onClick={onOpenInbox} aria-label={`Open inbox${inboxCount ? ` with ${inboxCount} notifications` : ''}`}>
          <InboxIcon />
          {inboxCount > 0 && <span className="icon-badge">{Math.min(inboxCount, 9)}</span>}
        </button>
        <button type="button" className="icon-button filled-icon-button" onClick={onOpenQuickAdd} aria-label="Open quick add">
          <BrainIcon />
        </button>
        <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Open settings">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
