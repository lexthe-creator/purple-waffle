import React from 'react';

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="settings-icon">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.24 7.24 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  );
}

export default function Header({ inboxCount, onOpenBrainDump, onOpenInbox, onOpenSettings }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Unified Task System</p>
        <h1>Capture, triage, plan, and execute in one flow</h1>
      </div>
      <div className="header-actions">
        <button type="button" className="primary-button" onClick={onOpenBrainDump}>
          Brain Dump
        </button>
        <button type="button" className="secondary-button" onClick={onOpenInbox}>
          Inbox{inboxCount > 0 ? ` (${inboxCount})` : ''}
        </button>
        <button type="button" className="icon-button" onClick={onOpenSettings} aria-label="Open settings">
          <SettingsIcon />
        </button>
      </div>
    </header>
  );
}
