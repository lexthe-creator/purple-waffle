import React from 'react';
import TaskItem from './TaskItem.jsx';

export default function PrioritiesSection({ tasks, handlers }) {
  return (
    <section className="task-card priorities-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Priorities</p>
          <h2>Current queue in working order</h2>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-message">No priorities yet. Move work into Planning or Execution to queue it here.</p>
      ) : (
        <ol className="priority-list">
          {tasks.map(task => (
            <li key={task.id} className="priority-list-item">
              <TaskItem task={task} {...handlers} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
