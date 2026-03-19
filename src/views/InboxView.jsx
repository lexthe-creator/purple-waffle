import React, { useEffect, useState } from 'react';

function InboxItem({ task, onCommitTitle, onMoveToPlanning, onDelete }) {
  const [value, setValue] = useState(task.title);

  useEffect(() => {
    setValue(task.title);
  }, [task.title]);

  function commit() {
    if (value === task.title) return;
    onCommitTitle(task.id, value);
  }

  return (
    <article className="inbox-item">
      <input
        className="task-title-input"
        value={value}
        placeholder="Untitled inbox item"
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
        onBlur={commit}
        aria-label="Inbox task title"
      />
      <div className="inbox-actions">
        <button type="button" className="secondary-button" onClick={() => onMoveToPlanning(task.id)}>
          Move to Planning
        </button>
        <button type="button" className="ghost-button danger-button" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </article>
  );
}

export default function InboxView({ tasks, onCommitTitle, onMoveToPlanning, onDelete }) {
  return (
    <section className="task-card">
      <div className="task-card-header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h2>Triage captured items</h2>
        </div>
      </div>

      <div className="inbox-list">
        {tasks.length === 0 ? (
          <p className="empty-message">Inbox is clear. Use Brain Dump to capture the next thing.</p>
        ) : (
          tasks.map(task => (
            <InboxItem
              key={task.id}
              task={task}
              onCommitTitle={onCommitTitle}
              onMoveToPlanning={onMoveToPlanning}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </section>
  );
}
