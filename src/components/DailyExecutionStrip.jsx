import React from 'react';

export default function DailyExecutionStrip({ activeCount, doneCount, plannedCount }) {
  const stats = [
    ['Planning', plannedCount],
    ['In Execution', activeCount],
    ['Done', doneCount],
  ];

  return (
    <section className="task-card feature-card">
      <div>
        <p className="eyebrow">Daily Execution Strip</p>
        <h2>See the day move from plan to completion</h2>
      </div>
      <div className="summary-row summary-row-tight">
        {stats.map(([label, value]) => (
          <div key={label} className="summary-tile">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
