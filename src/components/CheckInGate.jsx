import React from 'react';

export default function CheckInGate({ onOpenBrainDump }) {
  return (
    <section className="task-card feature-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Check-In Gate</p>
          <h2>Start the day by clearing the mental runway</h2>
        </div>
        <button type="button" className="secondary-button" onClick={onOpenBrainDump}>
          Open Brain Dump
        </button>
      </div>
      <p className="settings-copy">
        Capture anything noisy, then move into planning with a lighter working memory.
      </p>
    </section>
  );
}
