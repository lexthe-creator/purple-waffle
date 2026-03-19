import React from 'react';

const STATUS_OPTIONS = ['planned', 'completed', 'missed'];

export default function WeeklyPreview({ items, onStatusChange, onDateChange, onToggleReschedule }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Weekly preview</p>
          <h2>Adjust the week without leaving the dashboard</h2>
        </div>
      </div>

      <div className="weekly-list">
        {items.map(item => (
          <article key={item.id} className={`weekly-item status-${item.status}`}>
            <div className="weekly-main">
              <div>
                <strong>{item.title}</strong>
                <p>{item.dateLabel}</p>
              </div>
              <div className="weekly-status-row">
                {STATUS_OPTIONS.map(status => (
                  <button
                    key={status}
                    type="button"
                    className={`status-chip ${item.status === status ? 'is-active' : ''}`}
                    onClick={() => onStatusChange(item.id, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>

            {item.status === 'missed' && (
              <div className="reschedule-panel">
                <button type="button" className="ghost-button" onClick={() => onToggleReschedule(item.id)}>
                  Reschedule
                </button>
                {item.rescheduleOpen && (
                  <input type="date" className="task-title-input" value={item.date} onChange={event => onDateChange(item.id, event.target.value)} />
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
