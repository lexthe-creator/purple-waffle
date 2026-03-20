import React from 'react';

export default function GetToFirstValue({
  inboxCount,
  plannedCount,
  onOpenInbox,
  onDismiss,
  collapsed = false,
  onToggleCollapse,
}) {
  return (
    <section className="task-card feature-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Get To First Value</p>
          <h2>Turn captured input into one meaningful next move</h2>
        </div>
        <div className="card-actions">
          {onToggleCollapse && (
            <button type="button" className="ghost-button card-toggle-button" onClick={onToggleCollapse}>
              {collapsed ? 'Expand' : 'Collapse'}
            </button>
          )}
          {onDismiss && (
            <button type="button" className="ghost-button card-toggle-button" onClick={onDismiss}>
              Dismiss
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onOpenInbox}>
            Review Inbox
          </button>
        </div>
      </div>
      {!collapsed && (
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
      )}
    </section>
  );
}
