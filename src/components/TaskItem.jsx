import React, { useEffect, useRef, useState } from 'react';

export default function TaskItem({
  task,
  onCommitTitle,
  onToggleDone,
  onDelete,
  onMove,
  onAddSubtask,
  onCommitSubtaskTitle,
  onToggleSubtask,
  onCommitNotes,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [draftNotes, setDraftNotes] = useState(task.notes);
  const [subtaskDrafts, setSubtaskDrafts] = useState(() => Object.fromEntries(task.subtasks.map(subtask => [subtask.id, subtask.title])));
  const titleRef = useRef(null);

  useEffect(() => {
    setTitleValue(task.title);
  }, [task.title]);

  useEffect(() => {
    setDraftNotes(task.notes);
  }, [task.notes]);

  useEffect(() => {
    setSubtaskDrafts(Object.fromEntries(task.subtasks.map(subtask => [subtask.id, subtask.title])));
  }, [task.subtasks]);

  useEffect(() => {
    if (task.shouldFocusTitle) {
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [task.shouldFocusTitle]);

  function commitTitle() {
    if (titleValue === task.title) return;
    onCommitTitle(task.id, titleValue);
  }

  function commitSubtask(subtaskId) {
    const nextValue = subtaskDrafts[subtaskId] ?? '';
    const currentValue = task.subtasks.find(subtask => subtask.id === subtaskId)?.title ?? '';
    if (nextValue === currentValue) return;
    onCommitSubtaskTitle(task.id, subtaskId, nextValue);
  }

  return (
    <article className="task-item">
      <div className="task-row">
        <label className="task-checkbox">
          <input
            type="checkbox"
            checked={task.status === 'done'}
            onChange={() => onToggleDone(task.id)}
            aria-label={task.status === 'done' ? 'Mark task as not done' : 'Mark task as done'}
          />
          <span />
        </label>

        <input
          ref={titleRef}
          className="task-title-input"
          value={titleValue}
          placeholder="Untitled task"
          onChange={event => setTitleValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitle();
              titleRef.current?.blur();
            }
          }}
          onBlur={commitTitle}
          aria-label="Task title"
        />

        <div className="task-actions">
          <button type="button" className="ghost-button" onClick={() => setIsExpanded(value => !value)}>
            {isExpanded ? 'Hide' : 'Expand'}
          </button>
          <button type="button" className="ghost-button" onClick={() => onMove(task.id, -1)} aria-label="Move task up">
            ↑
          </button>
          <button type="button" className="ghost-button" onClick={() => onMove(task.id, 1)} aria-label="Move task down">
            ↓
          </button>
          <button type="button" className="ghost-button danger-button" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="task-expanded">
          <div className="task-section-header">
            <h4>Subtasks</h4>
            <button type="button" className="ghost-button" onClick={() => onAddSubtask(task.id)}>
              Add subtask
            </button>
          </div>

          <div className="subtask-list">
            {task.subtasks.length === 0 && <p className="empty-message small">No subtasks yet.</p>}
            {task.subtasks.map(subtask => (
              <div key={subtask.id} className="subtask-row">
                <label className="task-checkbox small-checkbox">
                  <input
                    type="checkbox"
                    checked={subtask.done}
                    onChange={() => onToggleSubtask(task.id, subtask.id)}
                    aria-label={subtask.done ? 'Mark subtask as not done' : 'Mark subtask as done'}
                  />
                  <span />
                </label>
                <input
                  value={subtaskDrafts[subtask.id] ?? ''}
                  className="subtask-input"
                  placeholder="Untitled subtask"
                  onChange={event => {
                    const nextValue = event.target.value;
                    setSubtaskDrafts(current => ({ ...current, [subtask.id]: nextValue }));
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitSubtask(subtask.id);
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => commitSubtask(subtask.id)}
                />
              </div>
            ))}
          </div>

          <div className="task-section-header notes-header">
            <h4>Notes</h4>
          </div>
          <textarea
            className="notes-textarea"
            value={draftNotes}
            placeholder="Add notes, context, or next steps"
            onChange={event => setDraftNotes(event.target.value)}
            onBlur={() => {
              if (draftNotes !== task.notes) {
                onCommitNotes(task.id, draftNotes);
              }
            }}
          />
        </div>
      )}
    </article>
  );
}
