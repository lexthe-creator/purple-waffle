import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
<<<<<<< HEAD
import BrainDumpModal from './components/BrainDumpModal.jsx';
import HomeView from './views/HomeView.jsx';
import InboxView from './views/InboxView.jsx';
import NutritionView from './views/NutritionView.jsx';
import WorkoutView from './views/WorkoutView.jsx';
import './styles.css';

const APP_STATE_STORAGE_KEY = 'purple-waffle-app-state-v2';

function generateId(prefix = 'item') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : 0;
    const orderB = Number.isFinite(b.order) ? b.order : 0;

    if (orderA !== orderB) return orderA - orderB;

    const createdAtA = Number.isFinite(a.createdAt) ? a.createdAt : 0;
    const createdAtB = Number.isFinite(b.createdAt) ? b.createdAt : 0;
    return createdAtA - createdAtB;
  });
}

function normalizeTask(task, index = 0) {
  const createdAt = Number.isFinite(task?.createdAt) ? task.createdAt : Date.now() + index;
  return {
    id: task?.id || generateId('task'),
    title: typeof task?.title === 'string' ? task.title : '',
    notes: typeof task?.notes === 'string' ? task.notes : '',
    status: task?.status === 'active' || task?.status === 'done' ? task.status : 'planned',
    createdAt,
    order: Number.isFinite(task?.order) ? task.order : index + 1,
    shouldFocusTitle: Boolean(task?.shouldFocusTitle),
  };
}

function normalizeInboxItem(item, index = 0) {
  const createdAt = Number.isFinite(item?.createdAt) ? item.createdAt : Date.now() + index;
  return {
    id: item?.id || generateId('inbox'),
    title: typeof item?.title === 'string' ? item.title : '',
    createdAt,
    order: Number.isFinite(item?.order) ? item.order : index + 1,
  };
}

function loadInitialState() {
  if (typeof window === 'undefined') {
    return { tasks: [], inbox: [], brainDump: '' };
  }

  try {
    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) return { tasks: [], inbox: [], brainDump: '' };

    const parsed = JSON.parse(raw);
    return {
      tasks: Array.isArray(parsed?.tasks) ? sortItems(parsed.tasks.map(normalizeTask)) : [],
      inbox: Array.isArray(parsed?.inbox) ? sortItems(parsed.inbox.map(normalizeInboxItem)) : [],
      brainDump: typeof parsed?.brainDump === 'string' ? parsed.brainDump : '',
    };
  } catch {
    return { tasks: [], inbox: [], brainDump: '' };
  }
}

function App() {
  const [appState, setAppState] = useState(loadInitialState);
  const [activeView, setActiveView] = useState('home');
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(appState));
  }, [appState]);

  const plannedTasks = useMemo(
    () => sortItems(appState.tasks.filter(task => task.status === 'planned')),
    [appState.tasks],
  );
  const activeTasks = useMemo(
    () => sortItems(appState.tasks.filter(task => task.status === 'active')),
    [appState.tasks],
  );
  const doneTasks = useMemo(
    () => sortItems(appState.tasks.filter(task => task.status === 'done')),
    [appState.tasks],
  );

  function updateTask(taskId, updater) {
    setAppState(current => ({
      ...current,
      tasks: sortItems(
        current.tasks.map(task => {
          if (task.id !== taskId) return task;
          return normalizeTask(updater(task));
        }),
      ),
    }));
  }

  function resequenceTasks(tasks) {
    return tasks.map((task, index) => ({ ...task, order: index + 1 }));
  }

  function commitTitle(taskId, title) {
    updateTask(taskId, task => ({ ...task, title, shouldFocusTitle: false }));
  }

  function commitNotes(taskId, notes) {
    updateTask(taskId, task => ({ ...task, notes }));
  }

  function deleteTask(taskId) {
    setAppState(current => ({
      ...current,
      tasks: current.tasks.filter(task => task.id !== taskId),
    }));
  }

  function moveTask(taskId, direction) {
    setAppState(current => {
      const target = current.tasks.find(task => task.id === taskId);
      if (!target) return current;

      const statusTasks = sortItems(current.tasks.filter(task => task.status === target.status));
      const index = statusTasks.findIndex(task => task.id === taskId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= statusTasks.length) return current;

      const reordered = [...statusTasks];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(nextIndex, 0, moved);

      const resequenced = resequenceTasks(reordered);
      const replacementMap = new Map(resequenced.map(task => [task.id, task]));

      return {
        ...current,
        tasks: sortItems(
          current.tasks.map(task => (replacementMap.has(task.id) ? replacementMap.get(task.id) : task)),
        ),
      };
    });
  }

  function createEmptyPlannedTask() {
    setAppState(current => ({
      ...current,
      tasks: sortItems([
        ...current.tasks,
        normalizeTask({
          id: generateId('task'),
          title: '',
          notes: '',
          status: 'planned',
          createdAt: Date.now(),
          order: plannedTasks.length + 1,
          shouldFocusTitle: true,
        }),
      ]),
    }));
  }

  function moveToExecution(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'active' }));
  }

  function moveBackToPlanning(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'planned' }));
  }

  function markDone(taskId) {
    updateTask(taskId, task => ({ ...task, status: 'done' }));
  }

  function commitInboxTitle(itemId, title) {
    setAppState(current => ({
      ...current,
      inbox: sortItems(current.inbox.map(item => (item.id === itemId ? { ...item, title } : item))),
    }));
  }

  function deleteInboxItem(itemId) {
    setAppState(current => ({
      ...current,
      inbox: current.inbox.filter(item => item.id !== itemId),
    }));
  }

  function moveInboxToPlanning(itemId) {
    setAppState(current => {
      const item = current.inbox.find(entry => entry.id === itemId);
      if (!item) return current;

      return {
        ...current,
        inbox: current.inbox.filter(entry => entry.id !== itemId),
        tasks: sortItems([
          ...current.tasks,
          normalizeTask({
            id: generateId('task'),
            title: item.title,
            notes: '',
            status: 'planned',
            createdAt: Date.now(),
            order: plannedTasks.length + 1,
          }),
        ]),
      };
    });
    setActiveView('home');
  }

  function sendToInbox(title) {
    setAppState(current => ({
      ...current,
      brainDump: '',
      inbox: sortItems([
        ...current.inbox,
        normalizeInboxItem({
          id: generateId('inbox'),
          title,
          createdAt: Date.now(),
          order: current.inbox.length + 1,
        }),
      ]),
    }));
    setBrainDumpOpen(false);
    setActiveView('inbox');
  }

  const sharedHandlers = {
    onCommitTitle: commitTitle,
    onDelete: deleteTask,
    onMove: moveTask,
    onCommitNotes: commitNotes,
  };
=======
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
>>>>>>> eab230cbcf736c22eb135038df426222f86ea233

  return (
    <div className="app-shell">
      <Header
        inboxCount={appState.inbox.length}
        onOpenBrainDump={() => setBrainDumpOpen(true)}
        onOpenInbox={() => setActiveView('inbox')}
      />

<<<<<<< HEAD
      <main className="app-content">
        {activeView === 'home' && (
          <HomeView
            inboxTasks={appState.inbox}
            plannedTasks={plannedTasks}
            activeTasks={activeTasks}
            doneTasks={doneTasks}
            sharedHandlers={sharedHandlers}
            onCreateEmptyTask={createEmptyPlannedTask}
            onMoveToExecution={moveToExecution}
            onMoveBackToPlanning={moveBackToPlanning}
            onOpenInbox={() => setActiveView('inbox')}
            onOpenBrainDump={() => setBrainDumpOpen(true)}
            onOpenNutrition={() => setActiveView('nutrition')}
            onOpenWorkout={() => setActiveView('workout')}
            onMarkTaskDone={markDone}
          />
        )}

        {activeView === 'inbox' && (
          <InboxView
            tasks={appState.inbox}
            onCommitTitle={commitInboxTitle}
            onMoveToPlanning={moveInboxToPlanning}
            onDelete={deleteInboxItem}
          />
        )}

        {activeView === 'nutrition' && <NutritionView onBackHome={() => setActiveView('home')} />}
        {activeView === 'workout' && <WorkoutView onBackHome={() => setActiveView('home')} />}
=======
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
>>>>>>> eab230cbcf736c22eb135038df426222f86ea233
      </main>

      <BrainDumpModal
        isOpen={brainDumpOpen}
        initialValue={appState.brainDump}
        onChange={value => {
          setAppState(current => ({ ...current, brainDump: value }));
        }}
        onClose={() => setBrainDumpOpen(false)}
        onSubmit={sendToInbox}
      />
    </div>
  );
}

<<<<<<< HEAD
=======
function App() {
  return (
    <TaskProvider>
      <AppProvider>
        <Dashboard />
      </AppProvider>
    </TaskProvider>
  );
}

>>>>>>> eab230cbcf736c22eb135038df426222f86ea233
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
