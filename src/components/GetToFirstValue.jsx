import React from 'react';

export default function GetToFirstValue({ inboxCount, plannedCount, onOpenInbox }) {
  return (
    <section className="task-card feature-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Get To First Value</p>
          <h2>Turn captured input into one meaningful next move</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onOpenInbox}>
          Review Inbox
        </button>
      </div>
      <div className="summary-row">
        <div className="summary-tile">
          <span>Inbox items</span>
          <strong>{inboxCount}</strong>
        </div>
        <div className="summary-tile">
          <span>Planned tasks</span>
          <strong>{plannedCount}</strong>
        </div>
      </div>
    </section>
  );
}
