import React from 'react';

export default function WorkoutView({ onBackHome }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Workout</p>
          <h2>Workout view placeholder</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onBackHome}>
          Back Home
        </button>
      </div>
      <p className="settings-copy">This destination is now functional so you can expand it with programming, recovery, and session details later.</p>
    </section>
  );
}
