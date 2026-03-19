import React from 'react';

export default function TaskFlowCard({ plannedCount, activeCount, doneCount }) {
  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Task Flow</p>
          <h2>Track momentum across the system</h2>
        </div>
      </div>
      <div className="summary-stack">
        <div className="summary-tile">
          <span>Planned</span>
          <strong>{plannedCount}</strong>
        </div>
        <div className="summary-tile">
          <span>Active</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="summary-tile">
          <span>Done</span>
          <strong>{doneCount}</strong>
        </div>
      </div>
    </section>
  );
}
