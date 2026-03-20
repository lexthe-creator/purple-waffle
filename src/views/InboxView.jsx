import React from 'react';

export default function InboxView({ isOpen, notifications, onClose, onMarkAllRead }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop inbox-backdrop" onClick={onClose}>
      <aside className="modal-card notification-center" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Inbox</p>
            <h2>Notification center</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={onMarkAllRead}>
            Mark all read
          </button>
        </div>
        <div className="notification-list">
          {notifications.length === 0 ? (
            <p className="empty-message">No alerts are blocking your day.</p>
          ) : (
            notifications.map(notification => (
              <article key={notification.id} className={`notification-item ${notification.read ? 'is-read' : ''}`}>
                <strong>{notification.title}</strong>
                <p>{notification.detail}</p>
              </article>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
