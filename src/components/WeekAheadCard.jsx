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
import React from 'react';

export default function WeekAheadCard({ inboxCount = 0, plannedCount = 0, activeCount = 0, doneCount = 0 }) {
  const copy = {
    MealCard: ['Meal', plannedCount, 'Use today\'s plan to protect energy and reduce friction.'],
    WorkoutCard: ['Workout', activeCount, 'Keep movement visible so execution stays realistic.'],
    WeeklyPreviewCard: ['Weekly Preview', doneCount, 'Zoom out and confirm the week still matches reality.'],
    WeekAheadCard: ['Week Ahead', plannedCount, 'Stage upcoming work before it becomes urgent.'],
    SomedaySoonCard: ['Someday / Soon', inboxCount, 'Hold future-facing ideas without crowding today.'],
    TaskFlowCard: ['Task Flow', activeCount || doneCount, 'Track what is moving now and what just shipped.'],
  }['WeekAheadCard'];

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
