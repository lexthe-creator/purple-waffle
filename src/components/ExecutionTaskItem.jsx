import React, { useEffect, useRef, useState } from 'react';

export default function ExecutionTaskItem({ task, onUpdateTask, onDeleteTask, onToggleDone, onToggleSubtask, onAddSubtask, onAddSibling }) {
  const [notesOpen, setNotesOpen] = useState(Boolean(task.notes));
  const titleRef = useRef(null);

  useEffect(() => {
    if (task.shouldFocusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [task.shouldFocusTitle]);

  return (
    <article className="execution-task-item">
      <div className="task-row execution-row">
        <label className="task-checkbox">
          <input type="checkbox" checked={task.status === 'done'} onChange={() => onToggleDone(task.id)} />
          <span />
        </label>

        <div className="task-main">
          <input
            ref={titleRef}
            className="task-title-input"
            value={task.title}
            placeholder="Task name"
            onChange={event => onUpdateTask(task.id, { title: event.target.value, shouldFocusTitle: false })}
            aria-label="Task name"
          />

          <div className="inline-actions">
            <button type="button" className="ghost-button" onClick={() => setNotesOpen(current => !current)}>
              {notesOpen ? 'Hide notes' : 'Add notes'}
            </button>
            <button type="button" className="ghost-button" onClick={() => onAddSubtask(task.id)}>
              + Add subtask
            </button>
            <button type="button" className="ghost-button" onClick={onAddSibling}>
              + Next task
            </button>
            <button type="button" className="ghost-button danger-button" onClick={() => onDeleteTask(task.id)}>
              Delete
            </button>
          </div>

          {notesOpen && (
            <textarea
              className="notes-textarea"
              value={task.notes}
              placeholder="Optional notes"
              onChange={event => onUpdateTask(task.id, { notes: event.target.value })}
            />
          )}

          <div className="subtask-tree">
            {task.subtasks.map(subtask => (
              <div key={subtask.id} className="subtask-row nested-row">
                <label className="task-checkbox small-checkbox">
                  <input type="checkbox" checked={subtask.done} onChange={() => onToggleSubtask(task.id, subtask.id)} />
                  <span />
                </label>
                <input
                  className="subtask-input"
                  value={subtask.title}
                  placeholder="Subtask"
                  onChange={event => onUpdateTask(task.id, {
                    subtasks: task.subtasks.map(item => (item.id === subtask.id ? { ...item, title: event.target.value } : item)),
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
