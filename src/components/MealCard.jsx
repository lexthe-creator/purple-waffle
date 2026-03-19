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
      <p className="settings-copy">
        Jump into the nutrition workspace to sketch meals, review the day, and expand this flow later.
      </p>
      <button type="button" className="secondary-button full-width" onClick={onOpenNutrition}>
        Open Nutrition
      </button>
    </section>
  );
}
