import React from 'react';

export default function TaskFlowCard({ priorities }) {
  const hasPriorities = priorities.length > 0;

  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Task Flow</p>
          <h2>Move from queue into focus</h2>
        </div>
      </div>

      <div className="summary-stack">
        <div className="summary-tile">
          <span>Priorities queued</span>
          <strong>{priorities.length}</strong>
        </div>
        <button type="button" className="secondary-button full-width" disabled={!hasPriorities}>
          {hasPriorities ? 'Start Focus Session' : 'Nothing queued'}
        </button>
      </div>
    </section>
  );
}
