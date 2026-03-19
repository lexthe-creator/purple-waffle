import React from 'react';
import TaskItem from './TaskItem.jsx';

export default function PlanningCard({ tasks, handlers, onCreateEmptyTask }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Priorities</p>
          <h2>Organize what matters</h2>
        </div>
        <button type="button" className="icon-button filled-icon-button" onClick={onCreateEmptyTask} aria-label="Create empty priority">
          +
        </button>
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-message">No priorities yet. Use + to create one and edit inline.</p>
        ) : (
          tasks.map(task => <TaskItem key={task.id} task={task} {...handlers} />)
        )}
      </div>
    </section>
  );
}
