import React from 'react';
import TaskItem from './TaskItem.jsx';

export default function PlanningCard({ tasks, handlers, onCreateEmptyTask, onMoveToExecution }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Planning</p>
          <h2>Organize what matters</h2>
        </div>
        <button type="button" className="icon-button filled-icon-button" onClick={onCreateEmptyTask} aria-label="Create empty planned task">
          +
        </button>
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-message">No planned tasks yet. Use + to create an empty task and edit inline.</p>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="task-transition-shell">
              <TaskItem task={task} {...handlers} />
              <button type="button" className="secondary-button full-width" onClick={() => onMoveToExecution(task.id)}>
                Move to Execution
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
