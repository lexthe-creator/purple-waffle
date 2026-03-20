import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import ExecutionTaskItem from './components/ExecutionTaskItem.jsx';
import WorkoutPlayer from './components/WorkoutPlayer.jsx';
import WeeklyPreview from './components/WeeklyPreview.jsx';
import InboxView from './views/InboxView.jsx';
import { TaskProvider, useTaskContext } from './context/TaskContext.jsx';
import { AppProvider, useAppContext } from './context/AppContext.jsx';
import './styles.css';

const QUICK_MEAL_TAGS = ['protein', 'carbs', 'veg', 'quick'];

function formatDateLabel(value) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function Dashboard() {
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationCenterOpen,
    setNotificationCenterOpen,
    energyState,
    setEnergyState,
  } = useAppContext();
  const {
    tasks,
    setTasks,
    meals,
    setMeals,
    notes,
    setNotes,
    workouts,
    setWorkouts,
    notifications,
    setNotifications,
    createTask,
    createMeal,
    createNote,
    createWorkout,
    createNotification,
    createSubtask,
  } = useTaskContext();

  const [quickMealName, setQuickMealName] = useState('');
  const [quickMealTags, setQuickMealTags] = useState([]);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [weeklyItems, setWeeklyItems] = useState(() => {
    const now = new Date();
    return [
      { id: 'week-1', title: 'Deep work block', status: 'planned', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10), rescheduleOpen: false },
      { id: 'week-2', title: 'Strength session', status: 'completed', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10), rescheduleOpen: false },
      { id: 'week-3', title: 'Meal prep', status: 'missed', date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().slice(0, 10), rescheduleOpen: false },
    ];
  });

  const executionTasks = useMemo(() => tasks.filter(task => task.status !== 'done'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter(task => task.status === 'done'), [tasks]);
  const unreadNotifications = useMemo(() => notifications.filter(notification => !notification.read), [notifications]);
  const activeWorkout = useMemo(() => workouts.find(workout => workout.id === activeWorkoutId) ?? null, [workouts, activeWorkoutId]);
  const latestMeal = meals[0];

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function updateTask(taskId, updates) {
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, ...updates } : task)));
  }

  function addInlineTask() {
    setTasks(current => [createTask({ status: 'active', shouldFocusTitle: true }), ...current]);
  }

  function deleteTask(taskId) {
    setTasks(current => current.filter(task => task.id !== taskId));
  }

  function toggleTaskDone(taskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? { ...task, status: task.status === 'done' ? 'active' : 'done' }
        : task
    )));
  }

  function toggleSubtask(taskId, subtaskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? {
            ...task,
            subtasks: task.subtasks.map(subtask => (
              subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask
            )),
          }
        : task
    )));
  }

  function addSubtask(taskId) {
    setTasks(current => current.map(task => (
      task.id === taskId
        ? { ...task, subtasks: [...task.subtasks, createSubtask('')] }
        : task
    )));
  }

  function handleQuickAdd({ type, value, meta }) {
    if (type === 'task') {
      setTasks(current => [createTask({ status: 'active', title: value, notes: meta }), ...current]);
      upsertNotification('Task captured', value);
      return;
    }

    if (type === 'meal') {
      setMeals(current => [createMeal({ name: value, tags: meta ? meta.split(',').map(tag => tag.trim()).filter(Boolean) : [] }), ...current]);
      upsertNotification('Meal logged', value);
      return;
    }

    if (type === 'workout') {
      setWorkouts(current => [createWorkout({ name: value, duration: Number.parseInt(meta, 10) || 30 }), ...current]);
      upsertNotification('Workout ready', value);
      return;
    }

    setNotes(current => [createNote({ content: value + (meta ? ` — ${meta}` : '') }), ...current]);
    upsertNotification('Note saved', value);
  }

  function submitQuickMeal() {
    const trimmed = quickMealName.trim();
    if (!trimmed) return;
    setMeals(current => [createMeal({ name: trimmed, tags: quickMealTags }), ...current]);
    setQuickMealName('');
    setQuickMealTags([]);
    upsertNotification('Quick meal added', trimmed);
  }

  function beginWorkout(workoutId) {
    setActiveWorkoutId(workoutId);
    setWorkouts(current => current.map(workout => (workout.id === workoutId ? { ...workout, status: 'active' } : workout)));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;
    setWorkouts(current => current.map(workout => (workout.id === activeWorkoutId ? { ...workout, status: 'planned' } : workout)));
    setActiveWorkoutId(null);
  }

  function completeWorkout() {
    if (!activeWorkoutId) return;
    setWorkouts(current => current.map(workout => (workout.id === activeWorkoutId ? { ...workout, status: 'completed' } : workout)));
    upsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    setActiveWorkoutId(null);
  }

  function applyEnergyCheckIn(value, sleepHours, sleepSource) {
    setEnergyState({
      value,
      sleepHours,
      sleepSource,
      lastCheckIn: new Date().toISOString(),
    });
  }

  function skipCheckIn() {
    setEnergyState(current => ({
      value: current.value ?? 3,
      sleepHours: current.sleepHours ?? 7,
      sleepSource: current.lastCheckIn ? 'last known' : 'baseline',
      lastCheckIn: current.lastCheckIn,
    }));
    upsertNotification('Energy auto-generated', 'Using your last known energy baseline.');
  }

  function updateWeeklyItem(itemId, updates) {
    setWeeklyItems(current => current.map(item => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  const weeklyViewItems = weeklyItems.map(item => ({ ...item, dateLabel: formatDateLabel(item.date) }));

  return (
    <div className="app-shell">
      <Header
        userName="Maya"
        inboxCount={unreadNotifications.length}
        onOpenInbox={() => setNotificationCenterOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
      />

      <main className="app-content single-flow-layout">
        <section className="task-card quiet-card">
          <div className="task-card-header compact-header">
            <div>
              <p className="eyebrow">Execution mode</p>
              <h2>Run the day from here</h2>
              <p className="section-copy">Inline capture, meals, workouts, and notes stay inside the same flow.</p>
            </div>
            <button type="button" className="secondary-button" onClick={addInlineTask}>+ Add task</button>
          </div>

          <div className="energy-strip">
            <div className="metric-card">
              <span>Energy</span>
              <strong>{energyState.value}/5</strong>
            </div>
            <div className="metric-card">
              <span>Sleep</span>
              <strong>{energyState.sleepHours}h</strong>
              <small>{energyState.sleepSource === 'manual' ? 'Manual' : energyState.sleepSource === 'integrated' ? 'Integrated' : 'Auto-filled'}</small>
            </div>
            <div className="metric-actions">
              <button type="button" className="ghost-button" onClick={() => applyEnergyCheckIn(4, 7.5, 'manual')}>Check in</button>
              <button type="button" className="ghost-button" onClick={skipCheckIn}>Skip</button>
            </div>
          </div>

          <div className="execution-list">
            {executionTasks.map(task => (
              <ExecutionTaskItem
                key={task.id}
                task={task}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onToggleDone={toggleTaskDone}
                onToggleSubtask={toggleSubtask}
                onAddSubtask={addSubtask}
                onAddSibling={addInlineTask}
              />
            ))}
          </div>
        </section>

        <div className="dashboard-columns">
          <section className="task-card quiet-card">
            <div className="task-card-header compact-header">
              <div>
                <p className="eyebrow">Meals</p>
                <h2>Quick add meal</h2>
              </div>
            </div>
            <div className="quick-entry-row">
              <input className="task-title-input" value={quickMealName} onChange={event => setQuickMealName(event.target.value)} placeholder="Meal name" />
              <button type="button" className="primary-button" onClick={submitQuickMeal}>Save</button>
            </div>
            <div className="tag-row">
              {QUICK_MEAL_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  className={`status-chip ${quickMealTags.includes(tag) ? 'is-active' : ''}`}
                  onClick={() => setQuickMealTags(current => current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag])}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="feed-card">
              <strong>{latestMeal?.name || 'No meals logged yet'}</strong>
              <p>{latestMeal?.tags?.length ? latestMeal.tags.join(' · ') : 'Single-step meal logging is ready.'}</p>
            </div>
          </section>

          <section className="task-card quiet-card">
            <div className="task-card-header compact-header">
              <div>
                <p className="eyebrow">Workout</p>
                <h2>Start and finish in one place</h2>
              </div>
            </div>
            {activeWorkout ? (
              <WorkoutPlayer workout={activeWorkout} onCancel={cancelWorkout} onComplete={completeWorkout} />
            ) : (
              <div className="workout-stack">
                {workouts.map(workout => (
                  <article key={workout.id} className="feed-card">
                    <strong>{workout.name}</strong>
                    <p>{workout.duration} min · {workout.status}</p>
                    <button type="button" className="secondary-button" onClick={() => beginWorkout(workout.id)}>
                      {workout.status === 'completed' ? 'Restart workout' : 'Start workout'}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="dashboard-columns">
          <section className="task-card quiet-card">
            <div className="task-card-header compact-header">
              <div>
                <p className="eyebrow">Notes</p>
                <h2>Recent captures</h2>
              </div>
            </div>
            <div className="simple-feed">
              {notes.map(note => (
                <article key={note.id} className="feed-card">
                  <p>{note.content}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="task-card quiet-card">
            <div className="task-card-header compact-header">
              <div>
                <p className="eyebrow">Completed</p>
                <h2>Finished today</h2>
              </div>
            </div>
            <div className="simple-feed">
              {completedTasks.length === 0 ? (
                <p className="empty-message">Completed tasks will land here.</p>
              ) : (
                completedTasks.map(task => (
                  <article key={task.id} className="feed-card done-card">
                    <strong>{task.title || 'Untitled task'}</strong>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <WeeklyPreview
          items={weeklyViewItems}
          onStatusChange={(itemId, status) => updateWeeklyItem(itemId, { status })}
          onDateChange={(itemId, date) => updateWeeklyItem(itemId, { date })}
          onToggleReschedule={itemId => updateWeeklyItem(itemId, { rescheduleOpen: !weeklyItems.find(item => item.id === itemId)?.rescheduleOpen })}
        />
      </main>

      <QuickAddModal isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} onSubmit={handleQuickAdd} />
      <InboxView
        isOpen={notificationCenterOpen}
        notifications={notifications}
        onClose={() => setNotificationCenterOpen(false)}
        onMarkAllRead={() => setNotifications(current => current.map(notification => ({ ...notification, read: true })))}
      />
    </div>
  );
}

function App() {
  return (
    <TaskProvider>
      <AppProvider>
        <Dashboard />
      </AppProvider>
    </TaskProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
