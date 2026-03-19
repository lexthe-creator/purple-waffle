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
export default function WorkoutCard({ inboxCount = 0, plannedCount = 0, activeCount = 0, doneCount = 0 }) {
  const copy = {
    MealCard: ['Meal', plannedCount, 'Use today\'s plan to protect energy and reduce friction.'],
    WorkoutCard: ['Workout', activeCount, 'Keep movement visible so execution stays realistic.'],
    WeeklyPreviewCard: ['Weekly Preview', doneCount, 'Zoom out and confirm the week still matches reality.'],
    WeekAheadCard: ['Week Ahead', plannedCount, 'Stage upcoming work before it becomes urgent.'],
    SomedaySoonCard: ['Someday / Soon', inboxCount, 'Hold future-facing ideas without crowding today.'],
    TaskFlowCard: ['Task Flow', activeCount || doneCount, 'Track what is moving now and what just shipped.'],
  }['WorkoutCard'];

  return (
    <section className="task-card context-card">
      <div>
        <p className="eyebrow">{copy[0]}</p>
        <h2>{copy[0]} overview</h2>
      </div>
      <div className="summary-tile">
        <span>Visible items</span>
        <strong>{copy[1]}</strong>
      </div>
      <p className="settings-copy">{copy[2]}</p>
    </section>
  );
}
