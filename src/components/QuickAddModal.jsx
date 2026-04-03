import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTaskContext } from '../context/TaskContext';

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

const TYPE_TABS = [
  { id: 'task', label: 'Task' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'workout', label: 'Workout' },
  { id: 'meal', label: 'Meal' },
];

const SUBMIT_LABELS = {
  task: 'Add task',
  schedule: 'Add to schedule',
  workout: 'Add workout',
  meal: 'Log meal',
};

export default function QuickAddModal({ isOpen, onClose, todayKey }) {
  const {
    createTask, setTasks,
    createCalendarItem, setCalendarItems,
    createWorkout, setWorkouts,
    createMeal, setMeals,
  } = useTaskContext();

  const [activeType, setActiveType] = useState('task');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState(false);

  const [schedTitle, setSchedTitle] = useState('');
  const [schedType, setSchedType] = useState('event');
  const [schedStart, setSchedStart] = useState('09:00');
  const [schedEnd, setSchedEnd] = useState('10:00');

  const [workoutName, setWorkoutName] = useState('Workout');

  const [mealName, setMealName] = useState('');
  const [mealSlot, setMealSlot] = useState('');

  const titleRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveType('task');
      setTaskTitle('');
      setTaskPriority(false);
      setSchedTitle('');
      setSchedType('event');
      setSchedStart('09:00');
      setSchedEnd('10:00');
      setWorkoutName('Workout');
      setMealName('');
      setMealSlot('');
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  function handleSubmit(event) {
    event.preventDefault();

    if (activeType === 'task') {
      const title = taskTitle.trim();
      if (!title) return;
      setTasks(current => [createTask({ title, priority: taskPriority }), ...current]);
    } else if (activeType === 'schedule') {
      const title = schedTitle.trim();
      if (!title) return;
      setCalendarItems(current => [
        createCalendarItem({ title, type: schedType, date: todayKey, startTime: schedStart, endTime: schedEnd }),
        ...current,
      ]);
    } else if (activeType === 'workout') {
      const name = workoutName.trim() || 'Workout';
      setWorkouts(current => [
        createWorkout({ name, scheduledDate: todayKey, plannedDate: todayKey }),
        ...current,
      ]);
    } else if (activeType === 'meal') {
      const name = mealName.trim();
      if (!name) return;
      const tags = mealSlot ? [`slot:${mealSlot}`] : [];
      setMeals(current => [createMeal({ name, tags }), ...current]);
    }

    onClose();
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card quick-capture-card" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Quick Add</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close quick add">
            &times;
          </button>
        </div>

        <div className="quick-add-tabs" role="tablist">
          {TYPE_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeType === id}
              className={`quick-add-tab${activeType === id ? ' is-active' : ''}`}
              onClick={() => setActiveType(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="quick-add-form" onSubmit={handleSubmit}>
          {activeType === 'task' && (
            <>
              <label className="field-stack compact-field">
                <span>Task</span>
                <input
                  ref={titleRef}
                  className="brain-dump-input quick-capture-input"
                  value={taskTitle}
                  onChange={e => setTaskTitle(e.target.value)}
                  placeholder="What needs to get done?"
                />
              </label>
              <label className="field-stack compact-field quick-add-priority-row">
                <input
                  type="checkbox"
                  checked={taskPriority}
                  onChange={e => setTaskPriority(e.target.checked)}
                />
                <span>Priority</span>
              </label>
            </>
          )}

          {activeType === 'schedule' && (
            <>
              <label className="field-stack compact-field">
                <span>Title</span>
                <input
                  ref={titleRef}
                  className="brain-dump-input quick-capture-input"
                  value={schedTitle}
                  onChange={e => setSchedTitle(e.target.value)}
                  placeholder="Meeting, block, or event name"
                />
              </label>
              <div className="field-stack compact-field">
                <span>Type</span>
                <div className="quick-add-type-row">
                  {['event', 'busy'].map(t => (
                    <button
                      key={t}
                      type="button"
                      className={`quick-add-type-chip${schedType === t ? ' is-active' : ''}`}
                      onClick={() => setSchedType(t)}
                    >
                      {t === 'event' ? 'Event' : 'Busy block'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="quick-add-time-row">
                <label className="field-stack compact-field">
                  <span>Start</span>
                  <input
                    type="time"
                    className="quick-capture-input"
                    value={schedStart}
                    onChange={e => setSchedStart(e.target.value)}
                  />
                </label>
                <label className="field-stack compact-field">
                  <span>End</span>
                  <input
                    type="time"
                    className="quick-capture-input"
                    value={schedEnd}
                    onChange={e => setSchedEnd(e.target.value)}
                  />
                </label>
              </div>
            </>
          )}

          {activeType === 'workout' && (
            <label className="field-stack compact-field">
              <span>Session name</span>
              <input
                ref={titleRef}
                className="brain-dump-input quick-capture-input"
                value={workoutName}
                onChange={e => setWorkoutName(e.target.value)}
                placeholder="Workout name"
              />
            </label>
          )}

          {activeType === 'meal' && (
            <>
              <label className="field-stack compact-field">
                <span>Item</span>
                <input
                  ref={titleRef}
                  className="brain-dump-input quick-capture-input"
                  value={mealName}
                  onChange={e => setMealName(e.target.value)}
                  placeholder="What did you eat or plan to eat?"
                />
              </label>
              <div className="field-stack compact-field">
                <span>Slot (optional)</span>
                <div className="quick-add-type-row">
                  {MEAL_SLOTS.map(slot => (
                    <button
                      key={slot}
                      type="button"
                      className={`quick-add-type-chip${mealSlot === slot ? ' is-active' : ''}`}
                      onClick={() => setMealSlot(prev => (prev === slot ? '' : slot))}
                    >
                      {slot.charAt(0).toUpperCase() + slot.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button type="submit" className="primary-button full-width">
            {SUBMIT_LABELS[activeType]}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
