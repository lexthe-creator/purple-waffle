import React from 'react';

export default function NutritionView({ onBackHome }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Nutrition</p>
          <h2>Nutrition view placeholder</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onBackHome}>
          Back Home
        </button>
      </div>
      <p className="settings-copy">This destination is now wired into navigation so meal planning, tracking, and templates can be layered in next.</p>
    </section>
  );
}
