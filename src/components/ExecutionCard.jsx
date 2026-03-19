import React from 'react';
import TaskItem from './TaskItem.jsx';

export default function ExecutionCard({ tasks, handlers, onMoveBackToPlanning }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Execution</p>
          <h2>Do the planned work</h2>
        </div>
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-message">Move a task from Planning to Execution when you are ready to work it.</p>
        ) : (
          tasks.map(task => (
            <div key={task.id} className="task-transition-shell">
              <TaskItem task={task} {...handlers} />
              <button type="button" className="ghost-button full-width" onClick={() => onMoveBackToPlanning(task.id)}>
                Back to Planning
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
