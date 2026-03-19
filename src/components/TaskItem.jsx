import React, { useEffect, useRef, useState } from 'react';

export default function TaskItem({ task, onCommitTitle, onDelete, onMove, onCommitNotes }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [draftNotes, setDraftNotes] = useState(task.notes);
  const titleRef = useRef(null);

  useEffect(() => {
    setTitleValue(task.title);
  }, [task.title]);

  useEffect(() => {
    setDraftNotes(task.notes);
  }, [task.notes]);

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

  return (
    <article className="task-item">
      <div className="task-row">
        <input
          ref={titleRef}
          className="task-title-input"
          value={titleValue}
          placeholder="Untitled priority"
          onChange={event => setTitleValue(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitle();
              titleRef.current?.blur();
            }
          }}
          onBlur={commitTitle}
          aria-label="Priority title"
        />

        <div className="task-actions">
          <button type="button" className="ghost-button" onClick={() => setIsExpanded(value => !value)}>
            {isExpanded ? 'Hide' : 'Expand'}
          </button>
          <button type="button" className="ghost-button" onClick={() => onMove(task.id, -1)} aria-label="Move priority up">
            ↑
          </button>
          <button type="button" className="ghost-button" onClick={() => onMove(task.id, 1)} aria-label="Move priority down">
            ↓
          </button>
          <button type="button" className="ghost-button danger-button" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="task-expanded">
          <div className="task-section-header notes-header">
            <h4>Notes</h4>
          </div>
          <textarea
            className="notes-textarea"
            value={draftNotes}
            placeholder="Add notes or context"
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
