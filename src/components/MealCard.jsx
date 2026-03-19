import React from 'react';

export default function MealCard({ onOpenNutrition }) {
  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h2>Plan the next meal</h2>
        </div>
      </div>
      <p className="settings-copy">Jump into the nutrition workspace to sketch meals, review the day, and expand this flow later.</p>
      <button type="button" className="secondary-button full-width" onClick={onOpenNutrition}>
        Open Nutrition
      </button>
export default function MealCard({ inboxCount = 0, plannedCount = 0, activeCount = 0, doneCount = 0 }) {
  const copy = {
    MealCard: ['Meal', plannedCount, 'Use today\'s plan to protect energy and reduce friction.'],
    WorkoutCard: ['Workout', activeCount, 'Keep movement visible so execution stays realistic.'],
    WeeklyPreviewCard: ['Weekly Preview', doneCount, 'Zoom out and confirm the week still matches reality.'],
    WeekAheadCard: ['Week Ahead', plannedCount, 'Stage upcoming work before it becomes urgent.'],
    SomedaySoonCard: ['Someday / Soon', inboxCount, 'Hold future-facing ideas without crowding today.'],
    TaskFlowCard: ['Task Flow', activeCount || doneCount, 'Track what is moving now and what just shipped.'],
  }['MealCard'];

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
