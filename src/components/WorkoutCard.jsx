import React from 'react';

export default function WorkoutCard({ onOpenWorkout }) {
  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Workout</p>
          <h2>Start today&apos;s training plan</h2>
        </div>
      </div>
      <p className="settings-copy">Open the workout view to prepare a session, review placeholders, and wire in richer training details later.</p>
      <button type="button" className="secondary-button full-width" onClick={onOpenWorkout}>
        Open Workout
      </button>
    </section>
  );
}
