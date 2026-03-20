import React, { useEffect, useRef, useState } from 'react';

export default function ExecutionTaskItem({
  task,
  onUpdateTask,
  onDeleteTask,
  onToggleDone,
  onToggleSubtask,
  onAddSubtask,
  onSetStatus,
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(task.notes));
  const titleRef = useRef(null);

  useEffect(() => {
    if (task.notes) {
      setNotesOpen(true);
    }
  }, [task.notes]);

  useEffect(() => {
    if (task.shouldFocusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [task.shouldFocusTitle]);

  function updateTask(patch) {
    onUpdateTask(task.id, { ...patch, shouldFocusTitle: false });
  }

  const statusLabel =
    task.status === 'done' ? 'Completed' :
    task.status === 'active' ? 'In execution' :
    'Planned';

  const nextStatus = task.status === 'active' ? 'planned' : 'active';
  const statusActionLabel = task.status === 'active' ? 'Park' : task.status === 'done' ? 'Reopen' : 'Move to execution';

  return (
    <article className={`execution-task-item ${task.status === 'done' ? 'is-done' : ''}`}>
      <div className="task-row execution-row">
        <label className="task-checkbox">
          <input type="checkbox" checked={task.status === 'done'} onChange={() => onToggleDone(task.id)} />
          <span />
        </label>

        <div className="task-main">
          <div className="task-header-line">
            <input
              ref={titleRef}
              className="task-title-input"
              value={task.title}
              placeholder="Task name"
              onChange={event => updateTask({ title: event.target.value })}
              aria-label="Task name"
            />

            <span className={`status-pill status-${task.status}`}>{statusLabel}</span>
          </div>

          <div className="inline-actions">
            <button type="button" className="ghost-button compact-ghost" onClick={() => setNotesOpen(current => !current)}>
              {notesOpen ? 'Hide notes' : 'Add notes'}
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={() => onAddSubtask(task.id)}>
              + Add subtask
            </button>
            {onSetStatus && (
              <button type="button" className="ghost-button compact-ghost" onClick={() => onSetStatus(task.id, nextStatus)}>
                {statusActionLabel}
              </button>
            )}
            <button type="button" className="ghost-button compact-ghost danger-button" onClick={() => onDeleteTask(task.id)}>
              Delete
            </button>
          </div>

          {notesOpen && (
            <textarea
              className="notes-textarea"
              value={task.notes}
              placeholder="Optional notes"
              onChange={event => updateTask({ notes: event.target.value })}
            />
          )}

          <div className="subtask-tree">
            {task.subtasks.map(subtask => (
              <div key={subtask.id} className="subtask-row nested-row">
                <label className="task-checkbox small-checkbox">
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    onChange={() => onToggleSubtask(task.id, subtask.id)}
                  />
                  <span />
                </label>
                <input
                  className="subtask-input"
                  value={subtask.title}
                  placeholder="Subtask"
                  onChange={event => onUpdateTask(task.id, {
                    subtasks: task.subtasks.map(item => (
                      item.id === subtask.id ? { ...item, title: event.target.value } : item
                    )),
                    shouldFocusTitle: false,
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
