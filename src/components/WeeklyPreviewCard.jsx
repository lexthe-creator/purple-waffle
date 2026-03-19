import React from 'react';

export default function WeeklyPreviewCard() {
  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Weekly Preview</p>
          <h2>See the shape of the week</h2>
        </div>
      </div>
      <div className="summary-stack">
        <div className="summary-tile">
          <span>Focus Areas</span>
          <strong>3</strong>
        </div>
        <p className="settings-copy">
          A lightweight snapshot for the week ahead. Replace these placeholders with real scheduling data when ready.
        </p>
      </div>
    </section>
  );
}
