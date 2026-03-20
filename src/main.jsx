import React, { useEffect, useMemo, useState } from 'react';
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
const ROOT_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'more', label: 'More' },
];

function formatDateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function RootTabPanel({ id, activeTab, children }) {
  const isActive = activeTab === id;

  return (
    <section className="root-tab-panel" data-tab={id} hidden={!isActive} aria-hidden={!isActive}>
      {children}
    </section>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="toolbar-icon">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.2 3.5c0-.36-.03-.7-.09-1.04l2.06-1.61-1.95-3.38-2.5 1a8.02 8.02 0 0 0-1.8-1.04l-.38-2.65H9.46l-.38 2.65c-.64.25-1.24.6-1.8 1.04l-2.5-1-1.95 3.38 2.06 1.61c-.06.34-.09.68-.09 1.04s.03.7.09 1.04L2.83 14.65l1.95 3.38 2.5-1c.56.44 1.16.79 1.8 1.04l.38 2.65h5.88l.38-2.65c.64-.25 1.24-.6 1.8-1.04l2.5 1 1.95-3.38-2.06-1.61c.06-.34.09-.68.09-1.04Z" />
    </svg>
  );
}

function BottomNav({ activeTab, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Primary tabs">
      {ROOT_TABS.map(tab => (
        <button
          key={tab.id}
          type="button"
          className={`bottom-nav-button ${activeTab === tab.id ? 'is-active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onChange(tab.id)}
        >
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}

function SettingsSheet({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card settings-sheet" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Settings</p>
            <h2>App shell</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <div className="settings-stack">
          <article className="settings-card">
            <strong>Navigation</strong>
            <p>Bottom tabs stay mounted, and global actions remain available from every screen.</p>
          </article>
          <article className="settings-card">
            <strong>Capture</strong>
            <p>The brain dump action and floating capture button both open quick add.</p>
          </article>
          <article className="settings-card">
            <strong>More</strong>
            <p>This screen is reserved for summaries and rollups, not configuration.</p>
          </article>
        </div>
      </section>
    </div>
  );
}

function DashboardScreen({ inboxCount }) {
  const { tasks, setTasks, createTask, createSubtask } = useTaskContext();

  const orderedTasks = useMemo(() => {
    const rank = { active: 0, planned: 1, done: 2 };

    return [...tasks].sort((a, b) => {
      const statusDelta = rank[a.status] - rank[b.status];
      if (statusDelta !== 0) return statusDelta;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [tasks]);

  const activeTasks = useMemo(() => orderedTasks.filter(task => task.status !== 'done'), [orderedTasks]);
  const completedTasks = useMemo(() => orderedTasks.filter(task => task.status === 'done'), [orderedTasks]);

  function updateTask(taskId, updates) {
    setTasks(current => current.map(task => (task.id === taskId ? { ...task, ...updates } : task)));
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

  function setTaskStatus(taskId, status) {
    updateTask(taskId, { status });
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

  function addInlineTask() {
    setTasks(current => [createTask({ status: 'active', shouldFocusTitle: true }), ...current]);
  }

  return (
    <div className="tab-stack">
      <section className="task-card execution-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Execution mode</p>
            <h2>Run the day from here</h2>
          </div>
          <button type="button" className="primary-button" onClick={addInlineTask}>
            + Add task
          </button>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Active</span>
            <strong>{activeTasks.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Done</span>
            <strong>{completedTasks.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Inbox</span>
            <strong>{inboxCount}</strong>
          </div>
        </div>

        <div className="execution-list">
          {orderedTasks.length === 0 ? (
            <div className="empty-panel">
              <strong>No tasks yet</strong>
              <p>Capture one inline and keep moving.</p>
            </div>
          ) : (
            orderedTasks.map(task => (
              <ExecutionTaskItem
                key={task.id}
                task={task}
                onUpdateTask={updateTask}
                onDeleteTask={deleteTask}
                onToggleDone={toggleTaskDone}
                onToggleSubtask={toggleSubtask}
                onAddSubtask={addSubtask}
                onSetStatus={setTaskStatus}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CalendarScreen() {
  const [weeklyItems, setWeeklyItems] = useState(() => {
    const now = new Date();

    return [
      {
        id: 'week-1',
        title: 'Deep work block',
        status: 'planned',
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10),
        rescheduleOpen: false,
      },
      {
        id: 'week-2',
        title: 'Strength session',
        status: 'completed',
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10),
        rescheduleOpen: false,
      },
      {
        id: 'week-3',
        title: 'Meal prep',
        status: 'missed',
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3).toISOString().slice(0, 10),
        rescheduleOpen: false,
      },
    ];
  });

  function updateWeeklyItem(itemId, updates) {
    setWeeklyItems(current => current.map(item => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  return (
    <div className="tab-stack">
      <WeeklyPreview
        items={weeklyItems.map(item => ({ ...item, dateLabel: formatDateLabel(item.date) }))}
        onStatusChange={(itemId, status) => updateWeeklyItem(itemId, { status })}
        onDateChange={(itemId, date) => updateWeeklyItem(itemId, { date })}
        onToggleReschedule={itemId => updateWeeklyItem(itemId, {
          rescheduleOpen: !weeklyItems.find(item => item.id === itemId)?.rescheduleOpen,
        })}
      />
    </div>
  );
}

function NutritionScreen() {
  const { meals, setMeals, createMeal, setNotifications, createNotification } = useTaskContext();
  const [mealName, setMealName] = useState('');
  const [mealTags, setMealTags] = useState([]);
  const latestMeal = meals[0] ?? null;

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function submitMeal() {
    const trimmed = mealName.trim();
    if (!trimmed) return;

    setMeals(current => [createMeal({ name: trimmed, tags: mealTags }), ...current]);
    setMealName('');
    setMealTags([]);
    upsertNotification('Meal logged', trimmed);
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Quick meal</p>
            <h2>Add a meal in one step</h2>
          </div>
        </div>

        <div className="quick-entry-row">
          <input
            className="task-title-input"
            value={mealName}
            onChange={event => setMealName(event.target.value)}
            placeholder="Meal name"
          />
          <button type="button" className="primary-button" onClick={submitMeal}>
            Save
          </button>
        </div>

        <div className="tag-row">
          {QUICK_MEAL_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              className={`status-chip ${mealTags.includes(tag) ? 'is-active' : ''}`}
              onClick={() => setMealTags(current => (
                current.includes(tag) ? current.filter(item => item !== tag) : [...current, tag]
              ))}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="subtle-feed">
          {latestMeal ? (
            <div className="feed-card">
              <strong>{latestMeal.name}</strong>
              <p>{latestMeal.tags.length ? latestMeal.tags.join(' · ') : 'No tags yet'}</p>
            </div>
          ) : (
            <p className="empty-message">No meals logged yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function FitnessScreen() {
  const { workouts, setWorkouts, setNotifications, createNotification } = useTaskContext();
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const activeWorkout = useMemo(
    () => workouts.find(workout => workout.id === activeWorkoutId) ?? null,
    [workouts, activeWorkoutId],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function startWorkout(workoutId) {
    setActiveWorkoutId(workoutId);
    setWorkouts(current => current.map(workout => (
      workout.id === workoutId ? { ...workout, status: 'active' } : workout
    )));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'planned' } : workout
    )));
    setActiveWorkoutId(null);
  }

  function completeWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'completed' } : workout
    )));
    upsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    setActiveWorkoutId(null);
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Workout</p>
            <h2>Start and finish in one place</h2>
          </div>
        </div>

        {activeWorkout ? (
          <WorkoutPlayer workout={activeWorkout} onCancel={cancelWorkout} onComplete={completeWorkout} />
        ) : (
          <div className="workout-stack">
            {workouts.length === 0 ? (
              <div className="empty-panel">
                <strong>No workout yet</strong>
                <p>Capture one with the add button or start from a template.</p>
              </div>
            ) : (
              workouts.map(workout => (
                <article key={workout.id} className="feed-card workout-card">
                  <strong>{workout.name}</strong>
                  <p>{workout.duration} min · {workout.status}</p>
                  <button type="button" className="secondary-button" onClick={() => startWorkout(workout.id)}>
                    {workout.status === 'completed' ? 'Restart workout' : 'Start workout'}
                  </button>
                </article>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MoreScreen() {
  const { tasks, meals, notes, workouts, notifications } = useTaskContext();
  const { energyState, setEnergyState } = useAppContext();
  const [energyDraft, setEnergyDraft] = useState({
    value: energyState.value ?? 3,
    sleepHours: energyState.sleepHours ?? 7,
    sleepSource: energyState.sleepSource === 'integrated' ? 'integrated' : 'manual',
  });

  useEffect(() => {
    setEnergyDraft({
      value: energyState.value ?? 3,
      sleepHours: energyState.sleepHours ?? 7,
      sleepSource: energyState.sleepSource === 'integrated' ? 'integrated' : 'manual',
    });
  }, [energyState.value, energyState.sleepHours, energyState.sleepSource]);

  const latestNote = notes[0] ?? null;
  const activeTasks = tasks.filter(task => task.status !== 'done');
  const unreadCount = notifications.filter(notification => !notification.read).length;

  function saveEnergyCheckIn() {
    setEnergyState({
      value: Number.isFinite(energyDraft.value) ? energyDraft.value : 3,
      sleepHours: Number.isFinite(energyDraft.sleepHours) ? energyDraft.sleepHours : 7,
      sleepSource: energyDraft.sleepSource,
      lastCheckIn: new Date().toISOString(),
    });
  }

  function skipEnergyCheckIn() {
    setEnergyState(current => {
      const fallbackValue = current.value ?? 3;
      const fallbackSleep = current.sleepHours ?? 7;
      const fallbackSource =
        current.sleepSource === 'integrated'
          ? 'integrated'
          : current.lastCheckIn
            ? 'last known'
            : 'baseline';

      return {
        value: fallbackValue,
        sleepHours: fallbackSleep,
        sleepSource: fallbackSource,
        lastCheckIn: new Date().toISOString(),
      };
    });
  }

  function getEnergyLabel() {
    if (energyState.sleepSource === 'integrated') return 'Integrated';
    if (energyState.sleepSource === 'manual') return 'Manual';
    if (energyState.sleepSource === 'last known') return 'Last known';
    return 'Baseline';
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Summary</p>
            <h2>Lightweight rollups</h2>
          </div>
        </div>

        <div className="summary-row">
          <div className="summary-tile">
            <span>Tasks</span>
            <strong>{activeTasks.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Meals</span>
            <strong>{meals.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Inbox</span>
            <strong>{unreadCount}</strong>
          </div>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Energy</p>
            <h2>Check in without breaking flow</h2>
          </div>
        </div>

        <div className="energy-strip">
          <div className="metric-card">
            <span>Energy</span>
            <strong>{energyState.value}/5</strong>
          </div>
          <div className="metric-card">
            <span>Sleep</span>
            <strong>{energyState.sleepHours}h</strong>
          </div>
          <div className="metric-card">
            <span>Source</span>
            <strong>{getEnergyLabel()}</strong>
          </div>
          <div className="metric-actions">
            <div className="status-chip-group" role="group" aria-label="Energy rating">
              {[1, 2, 3, 4, 5].map(value => (
                <button
                  key={value}
                  type="button"
                  className={`status-chip ${energyDraft.value === value ? 'is-active' : ''}`}
                  onClick={() => setEnergyDraft(current => ({ ...current, value }))}
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="field-stack compact-field">
              <span>Sleep hours</span>
              <input
                type="number"
                min="0"
                step="0.5"
                className="task-title-input"
                value={energyDraft.sleepHours}
                onChange={event => setEnergyDraft(current => ({
                  ...current,
                  sleepHours: Number.parseFloat(event.target.value),
                }))}
              />
            </label>
            <div className="status-chip-group" role="group" aria-label="Sleep source">
              <button
                type="button"
                className={`status-chip ${energyDraft.sleepSource === 'manual' ? 'is-active' : ''}`}
                onClick={() => setEnergyDraft(current => ({ ...current, sleepSource: 'manual' }))}
              >
                Manual
              </button>
              <button
                type="button"
                className={`status-chip ${energyDraft.sleepSource === 'integrated' ? 'is-active' : ''}`}
                onClick={() => setEnergyDraft(current => ({ ...current, sleepSource: 'integrated' }))}
              >
                Integrated
              </button>
            </div>
            <button type="button" className="secondary-button" onClick={saveEnergyCheckIn}>
              Save check-in
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={skipEnergyCheckIn}>
              Skip check-in
            </button>
          </div>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Recent captures</p>
            <h2>Notes and rollup state</h2>
          </div>
        </div>

        <div className="subtle-feed">
          {latestNote ? (
            <article className="feed-card">
              <strong>{latestNote.content}</strong>
            </article>
          ) : (
            <p className="empty-message">No notes captured yet.</p>
          )}
          <div className="feed-card">
            <strong>{workouts.length} workouts</strong>
            <p>Keep this tab ready for summary expansion later.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AppShell() {
  const {
    quickAddOpen,
    setQuickAddOpen,
    notificationCenterOpen,
    setNotificationCenterOpen,
    setNotifications,
    createNotification,
    setTasks,
    setMeals,
    setNotes,
    setWorkouts,
    createTask,
    createMeal,
    createNote,
    createWorkout,
    notifications,
  } = useTaskContext();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const unreadNotifications = useMemo(
    () => notifications.filter(notification => !notification.read),
    [notifications],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function handleQuickAdd({ type, title, notes: noteText, tags, duration, content }) {
    if (type === 'task') {
      const taskTitle = title.trim();
      if (!taskTitle) return;

      setTasks(current => [createTask({ status: 'active', title: taskTitle, notes: noteText }), ...current]);
      upsertNotification('Task captured', taskTitle);
      return;
    }

    if (type === 'meal') {
      const mealTitle = title.trim();
      if (!mealTitle) return;

      setMeals(current => [createMeal({ name: mealTitle, tags }), ...current]);
      upsertNotification('Meal logged', mealTitle);
      return;
    }

    if (type === 'workout') {
      const workoutTitle = title.trim();
      if (!workoutTitle) return;

      setWorkouts(current => [createWorkout({ name: workoutTitle, duration: Number.isFinite(duration) ? duration : 30 }), ...current]);
      upsertNotification('Workout saved', workoutTitle);
      return;
    }

    const note = content.trim();
    if (!note) return;

    setNotes(current => [createNote({ content: note }), ...current]);
    upsertNotification('Note saved', note.slice(0, 40));
  }

  function markAllNotificationsRead() {
    setNotifications(current => current.map(notification => ({ ...notification, read: true })));
  }

  return (
    <div className="app-shell">
      <Header
        userName="Alex"
        inboxCount={unreadNotifications.length}
        onOpenInbox={() => setNotificationCenterOpen(true)}
        onOpenQuickAdd={() => setQuickAddOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <button
        type="button"
        className="fab-button"
        onClick={() => setQuickAddOpen(true)}
        aria-label="Open quick capture"
      >
        +
      </button>

      <main className="app-content">
        <div className="tab-stack">
          <RootTabPanel id="dashboard" activeTab={activeTab}>
            <DashboardScreen inboxCount={unreadNotifications.length} />
          </RootTabPanel>

          <RootTabPanel id="calendar" activeTab={activeTab}>
            <CalendarScreen />
          </RootTabPanel>

          <RootTabPanel id="nutrition" activeTab={activeTab}>
            <NutritionScreen />
          </RootTabPanel>

          <RootTabPanel id="fitness" activeTab={activeTab}>
            <FitnessScreen />
          </RootTabPanel>

          <RootTabPanel id="more" activeTab={activeTab}>
            <MoreScreen />
          </RootTabPanel>
        </div>
      </main>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
      />

      <InboxView
        isOpen={notificationCenterOpen}
        notifications={notifications}
        onClose={() => setNotificationCenterOpen(false)}
        onMarkAllRead={markAllNotificationsRead}
      />

      <SettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function App() {
  return (
    <TaskProvider>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </TaskProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
