import React from 'react';

export default function MealCard({
  meal,
  onOpenNutrition,
  collapsed = false,
  onToggleCollapse,
  toggleLabel = 'Collapse',
}) {
  const title = meal?.name?.trim() || 'No meal planned';
  const detail = meal?.tags?.length ? meal.tags.join(' · ') : 'Meal planning is ready when you are.';

  return (
    <section className="task-card home-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Next Meal</p>
          <h2>Plan the next meal</h2>
        </div>
        <div className="card-actions">
          {onToggleCollapse && (
            <button type="button" className="ghost-button card-toggle-button" onClick={onToggleCollapse}>
              {toggleLabel}
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onOpenNutrition}>
            Open Nutrition
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="dashboard-card-body">
          <div className="summary-tile summary-tile-standalone">
            <span>Next meal</span>
            <strong>{title}</strong>
            <p className="settings-copy">{detail}</p>
          </div>
        </div>
      )}
    </section>
  );
}
