import React, { useEffect, useRef, useState } from 'react';

export default function ExecutionTaskItem({
  task,
  onUpdateTask,
  onDeleteTask,
  onToggleDone,
  onToggleSubtask,
  onAddSubtask,
  onSetStatus,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  isDragging,
  mode,
}) {
  const [notesOpen, setNotesOpen] = useState(Boolean(task.notes));
  const [actionsOpen, setActionsOpen] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const titleRef = useRef(null);
  const swipeRef = useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
  });

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

  function resetSwipe() {
    swipeRef.current = {
      active: false,
      pointerId: null,
      startX: 0,
      startY: 0,
    };
    setSwipeOffset(0);
  }

  function startSwipe(event) {
    if (event.target.closest('button,input,textarea,label')) return;

    swipeRef.current = {
      active: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveSwipe(event) {
    const state = swipeRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;

    if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    event.preventDefault();
    setSwipeOffset(Math.max(-96, Math.min(96, deltaX)));
  }

  function endSwipe(event) {
    const state = swipeRef.current;
    if (!state.active || state.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - state.startX;

    if (deltaX > 88) {
      onToggleDone(task.id);
    } else if (deltaX < -88) {
      onDeleteTask(task.id);
      return;
    }

    resetSwipe();
  }

  const nextStatus = task.status === 'active' ? 'planned' : 'active';
  const statusActionLabel = task.status === 'active' ? 'Park' : task.status === 'done' ? 'Reopen' : 'Move to execution';

  return (
    <div className="execution-task-wrapper">
      {/* Swipe hint: right = done */}
      <div className="swipe-hint swipe-hint-right" aria-hidden="true">
        <svg viewBox="0 0 14 14" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="1,7 5,12 13,2" />
        </svg>
      </div>

      {/* Swipe hint: left = delete */}
      <div className="swipe-hint swipe-hint-left" aria-hidden="true">
        <svg viewBox="0 0 14 14" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="2,2 12,12" />
          <polyline points="12,2 2,12" />
        </svg>
      </div>

      <article
        className={`execution-task-item${task.status === 'done' ? ' is-done' : ''}${isDragging ? ' is-dragging' : ''}`}
        data-task-id={task.id}
        style={{ '--swipe-offset': `${swipeOffset}px` }}
        onPointerDown={startSwipe}
        onPointerMove={moveSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={resetSwipe}
      >
        <div className="task-row execution-row">
          <button
            type="button"
            className="drag-handle"
            aria-label={`Drag ${task.title || 'task'}`}
            onPointerDown={event => onStartDrag?.(task.id, event)}
            onPointerMove={event => onMoveDrag?.(task.id, event)}
            onPointerUp={() => onEndDrag?.(task.id)}
            onPointerCancel={() => onEndDrag?.(task.id)}
          >
            <span />
            <span />
            <span />
          </button>

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

              <div className="task-header-meta">
                {task.priority && <span className="status-pill status-priority">Priority</span>}
                <button
                  type="button"
                  className="task-more-toggle"
                  aria-label="More actions"
                  onClick={() => setActionsOpen(v => !v)}
                >
                  ⋯
                </button>
              </div>
            </div>

            {actionsOpen && (
              <div className="task-secondary-actions">
                {onSetStatus && (
                  <button type="button" className="ghost-button compact-ghost" onClick={() => { onSetStatus(task.id, nextStatus); setActionsOpen(false); }}>
                    {statusActionLabel}
                  </button>
                )}
                <button type="button" className="ghost-button compact-ghost" onClick={() => { setNotesOpen(v => !v); setActionsOpen(false); }}>
                  {notesOpen ? 'Hide notes' : 'Add notes'}
                </button>
                <button type="button" className="ghost-button compact-ghost" onClick={() => { onAddSubtask(task.id); setActionsOpen(false); }}>
                  + Subtask
                </button>
                <button type="button" className="ghost-button compact-ghost danger-button" onClick={() => onDeleteTask(task.id)}>
                  Delete
                </button>
              </div>
            )}

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
    </div>
  );
}
