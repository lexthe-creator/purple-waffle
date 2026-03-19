import React, { useEffect, useState } from 'react';

function ExecutionItem({ task, onCommitTitle, onCommitNotes, onDelete, onMoveBackToPlanning, onMarkDone }) {
  const [titleValue, setTitleValue] = useState(task.title);
  const [notesValue, setNotesValue] = useState(task.notes);

  useEffect(() => {
    setTitleValue(task.title);
  }, [task.title]);

  useEffect(() => {
    setNotesValue(task.notes);
  }, [task.notes]);

  function commitTitle() {
    if (titleValue !== task.title) {
      onCommitTitle(task.id, titleValue);
    }
  }

  function commitNotes() {
    if (notesValue !== task.notes) {
      onCommitNotes(task.id, notesValue);
    }
  }

  return (
    <article className="task-item">
      <div className="task-row">
        <input
          className="task-title-input"
          value={titleValue}
          placeholder="Untitled execution item"
          onChange={event => setTitleValue(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitTitle();
              event.currentTarget.blur();
            }
          }}
          aria-label="Execution task title"
        />

        <div className="task-actions">
          <button type="button" className="ghost-button" onClick={() => onMoveBackToPlanning(task.id)}>
            Back to Planning
          </button>
          <button type="button" className="secondary-button" onClick={() => onMarkDone(task.id)}>
            Mark Done
          </button>
          <button type="button" className="ghost-button danger-button" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      </div>

      <div className="task-expanded">
        <div className="task-section-header notes-header">
          <h4>Notes</h4>
        </div>
        <textarea
          className="notes-textarea"
          value={notesValue}
          placeholder="Add execution notes or blockers"
          onChange={event => setNotesValue(event.target.value)}
          onBlur={commitNotes}
        />
      </div>
    </article>
  );
}

export default function ExecutionCard({ tasks, handlers, onMoveBackToPlanning, onMarkDone }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Execution</p>
          <h2>Work what is already in motion</h2>
        </div>
      </div>

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-message">Nothing is in execution yet. Move a planned task over when you are ready.</p>
        ) : (
          tasks.map(task => (
            <ExecutionItem
              key={task.id}
              task={task}
              onCommitTitle={handlers.onCommitTitle}
              onCommitNotes={handlers.onCommitNotes}
              onDelete={handlers.onDelete}
              onMoveBackToPlanning={onMoveBackToPlanning}
              onMarkDone={onMarkDone}
            />
          ))
        )}
      </div>
    </section>
  );
}
