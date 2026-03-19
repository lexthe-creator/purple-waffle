import React from 'react';
import PlanningCard from './PlanningCard.jsx';
import ExecutionCard from './ExecutionCard.jsx';

export default function Priorities({
  plannedTasks,
  activeTasks,
  doneTasks,
  sharedHandlers,
  onCreateEmptyTask,
  onMoveToExecution,
  onMoveBackToPlanning,
}) {
  return (
    <section className="task-card priorities-shell">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Priorities</p>
          <h2>Plan, execute, and review today&apos;s work</h2>
        </div>
      </div>
      <div className="board-grid priorities-grid">
        <PlanningCard
          tasks={plannedTasks.map(task => ({ ...task, shouldFocusTitle: Boolean(task.shouldFocusTitle) }))}
          handlers={sharedHandlers}
          onCreateEmptyTask={onCreateEmptyTask}
          onMoveToExecution={onMoveToExecution}
        />
        <ExecutionCard
          tasks={activeTasks}
          handlers={sharedHandlers}
          onMoveBackToPlanning={onMoveBackToPlanning}
        />
        <section className="task-card">
          <div className="task-card-header">
            <div>
              <p className="eyebrow">Done</p>
              <h2>Completed tasks</h2>
            </div>
          </div>
          <div className="task-list compact-list">
            {doneTasks.length === 0 ? (
              <p className="empty-message">Completed work will appear here.</p>
            ) : (
              doneTasks.map(task => (
                <div key={task.id} className="transition-row done-row">
                  <span className="transition-title">{task.title || 'Untitled task'}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
