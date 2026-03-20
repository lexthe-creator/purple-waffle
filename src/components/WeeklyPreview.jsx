import React from 'react';

const STATUS_OPTIONS = [
  { id: 'planned', label: 'Planned' },
  { id: 'completed', label: 'Completed' },
  { id: 'missed', label: 'Missed' },
];

export default function WeeklyPreview({ items, onStatusChange, onDateChange, onToggleReschedule }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Weekly preview</p>
          <h2>Adjust the week inline</h2>
        </div>
      </div>

      <div className="weekly-list">
        {items.map(item => (
          <article key={item.id} className={`weekly-item status-${item.status}`}>
            <div className="weekly-main">
              <div className="weekly-copy">
                <strong>{item.title}</strong>
                <p>{item.dateLabel}</p>
              </div>
              <div className="weekly-status-row">
                {STATUS_OPTIONS.map(status => (
                  <button
                    key={status.id}
                    type="button"
                    className={`status-chip ${item.status === status.id ? 'is-active' : ''}`}
                    onClick={() => onStatusChange(item.id, status.id)}
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            </div>

            {item.status === 'missed' && (
              <div className="reschedule-panel">
                <button type="button" className="ghost-button compact-ghost" onClick={() => onToggleReschedule(item.id)}>
                  Reschedule
                </button>
                {item.rescheduleOpen && (
                  <input
                    type="date"
                    className="task-title-input"
                    value={item.date}
                    onChange={event => onDateChange(item.id, event.target.value)}
                  />
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
