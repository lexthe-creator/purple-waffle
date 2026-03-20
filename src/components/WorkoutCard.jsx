import React from 'react';

export default function WorkoutCard({
  workout,
  onOpenWorkout,
  collapsed = false,
  onToggleCollapse,
  toggleLabel = 'Collapse',
}) {
  const title = workout?.name?.trim() || 'No workout scheduled';
  const duration = Number.isFinite(workout?.duration) ? `${workout.duration} min` : '—';
  const status = workout?.status ? workout.status.charAt(0).toUpperCase() + workout.status.slice(1) : 'No workout';
  const ctaLabel = !workout ? 'Open Workout' : workout.status === 'active' ? 'Continue' : 'Start';
  const isEmpty = !workout;

  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Today&apos;s Workout</p>
          <h2>Start today&apos;s training plan</h2>
        </div>
        <div className="card-actions">
          {onToggleCollapse && (
            <button type="button" className="ghost-button card-toggle-button" onClick={onToggleCollapse}>
              {toggleLabel}
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="dashboard-card-body">
          {isEmpty ? (
            <div className="empty-fallback">
              <strong>No workout exists yet</strong>
              <p className="settings-copy">Create or open a workout to start the day from here.</p>
            </div>
          ) : (
            <div className="summary-tile summary-tile-standalone">
              <span>Workout</span>
              <strong>{title}</strong>
              <p className="settings-copy">
                {duration} · {status}
              </p>
            </div>
          )}

          <button type="button" className="primary-button full-width" onClick={onOpenWorkout}>
            {ctaLabel}
          </button>
        </div>
      )}
    </section>
  );
}
