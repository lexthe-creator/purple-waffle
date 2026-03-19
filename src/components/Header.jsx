import React from 'react';

export default function Header({ inboxCount, onOpenBrainDump, onOpenInbox }) {
  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Planning First</p>
        <h1>Capture, triage, and shape today before you start</h1>
      </div>
      <div className="header-actions">
        <button type="button" className="primary-button" onClick={onOpenBrainDump}>
          Brain Dump
        </button>
        <button type="button" className="secondary-button" onClick={onOpenInbox}>
          Inbox{inboxCount > 0 ? ` (${inboxCount})` : ''}
        </button>
      </div>
    </header>
  );
}
