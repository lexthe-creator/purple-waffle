import React, { useState } from 'react';

const UPCOMING_ITEMS = [
  'Prep meals for the next three days',
  'Schedule the primary workout block',
  'Review open tasks before Monday starts',
];

export default function WeekAheadCard() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Week Ahead</p>
          <h2>Hold the next horizon</h2>
        </div>
        <button type="button" className="ghost-button" onClick={() => setIsExpanded(value => !value)}>
          {isExpanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      <p className="settings-copy">Keep one card dedicated to what needs attention beyond today.</p>
      {isExpanded && (
        <div className="summary-stack">
          {UPCOMING_ITEMS.map(item => (
            <div key={item} className="transition-row">
              <span className="transition-title">{item}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
