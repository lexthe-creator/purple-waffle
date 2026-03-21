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
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconPath: '<path d="M3 12L12 3l9 9v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-9Z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    iconPath: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  },
  {
    id: 'nutrition',
    label: 'Nutrition',
    iconPath: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8Z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    iconPath: '<circle cx="18.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><line x1="9" y1="15" x2="15" y2="9"/><line x1="7" y1="7" x2="7" y2="12"/><line x1="7" y1="7" x2="12" y2="7"/><line x1="17" y1="17" x2="17" y2="12"/><line x1="17" y1="17" x2="12" y2="17"/>',
  },
  {
    id: 'more',
    label: 'More',
    iconPath: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  },
];

function formatDateLabel(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
}

function formatShortMonthDay(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toDateKey(value) {
  return startOfDay(value).toISOString().slice(0, 10);
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function sameDay(left, right) {
  return toDateKey(left) === toDateKey(right);
}

function getGreeting(now = new Date()) {
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night';
}

function createCalendarSeed() {
  const now = new Date();
  return [
    {
      id: 'calendar-1',
      type: 'busy',
      title: 'Deep work block',
      date: toDateKey(now),
      startTime: '09:00',
      endTime: '11:00',
      repeatWeekly: true,
      priority: true,
    },
    {
      id: 'calendar-2',
      type: 'event',
      title: 'Lunch check-in',
      date: toDateKey(now),
      startTime: '12:30',
      endTime: '13:00',
      notes: '',
      repeatWeekly: false,
      priority: false,
    },
    {
      id: 'calendar-3',
      type: 'task',
      taskId: 'task-priority',
      title: 'Clear follow-ups',
      date: toDateKey(addDays(now, 1)),
      startTime: '16:00',
      endTime: '16:30',
      priority: true,
    },
  ];
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
          <svg
            className="nav-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: tab.iconPath }}
          />
          <span className="nav-label">{tab.label}</span>
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

function DashboardScreen({ inboxCount, now, activeWorkoutId, onStartWorkout, calendarItems }) {
  const { tasks, setTasks, meals, workouts, notifications, createTask, createSubtask } = useTaskContext();
  const [dailySearch, setDailySearch] = useState('');
  const [priorityOnly, setPriorityOnly] = useState(true);
  const [agendaExpanded, setAgendaExpanded] = useState(false);
  const [mealsExpanded, setMealsExpanded] = useState(false);
  const [prioritiesExpanded, setPrioritiesExpanded] = useState(false);
  const [stripExpanded, setStripExpanded] = useState(false);

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
  const todayKey = toDateKey(now);
  const todaysMeals = useMemo(
    () => meals.filter(meal => toDateKey(meal.loggedAt) === todayKey),
    [meals, todayKey],
  );
  const todaysAgendaItems = useMemo(() => {
    const items = [];

    tasks.forEach(task => {
      if (task.status === 'done') return;
      if (priorityOnly && task.status !== 'active') return;
      if (dailySearch && !task.title.toLowerCase().includes(dailySearch.toLowerCase())) return;
      items.push({
        id: task.id,
        type: 'task',
        title: task.title || 'Untitled task',
        subtitle: task.status === 'active' ? 'In execution' : 'Planned',
      });
    });

    meals.forEach(meal => {
      if (toDateKey(meal.loggedAt) !== todayKey) return;
      items.push({
        id: meal.id,
        type: 'meal',
        title: meal.name || 'Meal',
        subtitle: meal.tags.length ? meal.tags.join(' · ') : 'Logged today',
      });
    });

    workouts.forEach(workout => {
      if (workout.status === 'completed' && !sameDay(workout.createdAt, now)) return;
      items.push({
        id: workout.id,
        type: 'workout',
        title: workout.name,
        subtitle: `${workout.duration} min · ${workout.status}`,
      });
    });

    calendarItems.forEach(item => {
      if (item.date !== todayKey || item.type !== 'busy') return;
      items.push({
        id: item.id,
        type: 'busy',
        title: item.title,
        subtitle: `${item.startTime} - ${item.endTime}`,
      });
    });

    notifications.slice(0, 3).forEach(notification => {
      items.push({
        id: notification.id,
        type: 'inbox',
        title: notification.title,
        subtitle: notification.detail || 'Inbox item',
      });
    });

    return items.slice(0, agendaExpanded ? 5 : 3);
  }, [agendaExpanded, calendarItems, dailySearch, meals, notifications, now, priorityOnly, tasks, workouts, todayKey]);

  const todayBusyBlocks = useMemo(() => {
    return calendarItems.filter(item => item.date === todayKey && item.type === 'busy');
  }, [calendarItems, todayKey]);

  const dailyProgress = useMemo(() => {
    const completed = tasks.filter(task => task.status === 'done').length;
    const total = tasks.length || 1;
    return Math.round((completed / total) * 100);
  }, [tasks]);

  const activeWorkout = useMemo(() => {
    if (!activeWorkoutId) return null;
    return workouts.find(workout => workout.id === activeWorkoutId) ?? null;
  }, [activeWorkoutId, workouts]);

  const nextWorkout = useMemo(() => {
    if (activeWorkout) return activeWorkout;
    return workouts.find(workout => workout.status !== 'completed') ?? workouts[0] ?? null;
  }, [activeWorkout, workouts]);

  const priorityItems = useMemo(
    () => orderedTasks.filter(task => task.status === 'active' || task.subtasks.some(subtask => subtask.done === false)).slice(0, 4),
    [orderedTasks],
  );

  const visiblePriorityItems = prioritiesExpanded ? priorityItems : priorityItems.slice(0, 2);

  const sevenDayStrip = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(now, index);
      const key = toDateKey(day);
      return {
        id: key,
        label: formatDateLabel(key),
        date: key,
        flaggedCount: [
          ...tasks.filter(task => (task.status === 'active' || task.status === 'planned') && index <= 2),
          ...meals.filter(meal => toDateKey(meal.loggedAt) === key),
        ].length > 0 ? 1 : 0,
      };
    }).filter(item => item.flaggedCount > 0);
  }, [meals, now, tasks]);

  const visibleSevenDayStrip = stripExpanded ? sevenDayStrip : sevenDayStrip.slice(0, 3);
  const visibleMeals = mealsExpanded ? todaysMeals : todaysMeals.slice(0, 1);

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

  function convertInboxToTask(notificationId) {
    const source = notifications.find(notification => notification.id === notificationId);
    if (!source) return;

    setTasks(current => [
      createTask({
        status: 'active',
        title: source.title,
        notes: source.detail,
        shouldFocusTitle: true,
      }),
      ...current,
    ]);
  }

  function moveTask(taskId, direction) {
    setTasks(current => {
      const index = current.findIndex(task => task.id === taskId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">{formatFullDate(now)}</p>
            <h2>{getGreeting(now)}</h2>
          </div>
          <button type="button" className="ghost-button compact-ghost" onClick={() => setPriorityOnly(current => !current)}>
            {priorityOnly ? 'Priority only' : 'Show all'}
          </button>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Today card</p>
            <h2>Open-day context</h2>
          </div>
        </div>
        <div className="summary-row">
          <div className="summary-tile">
            <span>Tasks</span>
            <strong>{tasks.filter(task => task.status !== 'done').length}</strong>
          </div>
          <div className="summary-tile">
            <span>Meals</span>
            <strong>{todaysMeals.length}</strong>
          </div>
          <div className="summary-tile">
            <span>Blocks</span>
            <strong>{todayBusyBlocks.length}</strong>
          </div>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Agenda</p>
            <h2>Today only</h2>
          </div>
          <div className="header-stack">
            <input
              className="task-title-input compact-search"
              value={dailySearch}
              onChange={event => setDailySearch(event.target.value)}
              placeholder="Filter today"
            />
            <button type="button" className="ghost-button compact-ghost" onClick={() => setAgendaExpanded(current => !current)}>
              {agendaExpanded ? 'Less' : 'More'}
            </button>
          </div>
        </div>
        <div className="subtle-feed">
          {todaysAgendaItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No items for today</strong>
              <p>Capture something with the plus button.</p>
            </div>
          ) : (
            todaysAgendaItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.subtitle}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Daily progress</p>
            <h2>Execution momentum</h2>
          </div>
          <strong>{dailyProgress}%</strong>
        </div>
        <div className="progress-bar">
          <span style={{ width: `${dailyProgress}%` }} />
        </div>
      </section>

      <section className="task-card execution-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Daily execution</p>
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

        <div className="quick-entry-row">
          <button type="button" className="ghost-button compact-ghost" onClick={() => setPriorityOnly(current => !current)}>
            {priorityOnly ? 'Priority focus' : 'All tasks'}
          </button>
          <button type="button" className="ghost-button compact-ghost" onClick={addInlineTask}>
            Quick add task
          </button>
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
                onMoveUp={() => moveTask(task.id, -1)}
                onMoveDown={() => moveTask(task.id, 1)}
              />
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Inbox to task</p>
            <h2>Promote an item</h2>
          </div>
        </div>
        <div className="subtle-feed">
          {notifications.length === 0 ? (
            <div className="empty-panel">
              <strong>No inbox items</strong>
              <p>Inbox items can be converted directly into tasks.</p>
            </div>
          ) : (
            notifications.slice(0, 3).map(notification => (
              <article key={notification.id} className="feed-card">
                <strong>{notification.title}</strong>
                <p>{notification.detail || 'Inbox item'}</p>
                <button type="button" className="ghost-button compact-ghost" onClick={() => convertInboxToTask(notification.id)}>
                  Convert to task
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Today&apos;s workout</p>
            <h2>Workout card</h2>
          </div>
        </div>
        {nextWorkout ? (
          <article className="feed-card">
            <strong>{nextWorkout.name}</strong>
            <p>{nextWorkout.type || 'Workout'} · {nextWorkout.duration} min · {nextWorkout.status}</p>
            <button type="button" className="secondary-button" onClick={() => onStartWorkout(nextWorkout.id)}>
              {activeWorkout ? 'Continue' : 'Start'}
            </button>
          </article>
        ) : (
          <div className="empty-panel">
            <strong>No workout exists yet</strong>
            <p>Add one with quick capture.</p>
          </div>
        )}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Meal summary</p>
            <h2>Today&apos;s meals only</h2>
          </div>
          {todaysMeals.length > 1 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setMealsExpanded(current => !current)}>
              {mealsExpanded ? 'Less' : `${todaysMeals.length} meals`}
            </button>
          )}
        </div>
        {visibleMeals.length > 0 ? (
          <div className="subtle-feed">
            {visibleMeals.map(meal => (
              <article key={meal.id} className="feed-card">
                <strong>{meal.name}</strong>
                <p>{meal.tags.length ? meal.tags.join(' · ') : 'No tags yet'}</p>
              </article>
            ))}
            {!mealsExpanded && todaysMeals.length > 1 && (
              <p className="empty-message">{todaysMeals.length - 1} more meals hidden</p>
            )}
          </div>
        ) : (
          <div className="empty-panel">
            <strong>No meals logged today</strong>
            <p>Nutrition stays lightweight here.</p>
          </div>
        )}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Task priorities</p>
            <h2>What matters now</h2>
          </div>
          {priorityItems.length > 2 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setPrioritiesExpanded(current => !current)}>
              {prioritiesExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="subtle-feed">
          {visiblePriorityItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No active priorities</strong>
              <p>Promote a task to active to surface it here.</p>
            </div>
          ) : (
            visiblePriorityItems.map(task => (
              <article key={task.id} className="feed-card">
                <strong>{task.title}</strong>
                <p>{task.status} · {task.subtasks.filter(subtask => subtask.done === false).length} open subtasks</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">7-day strip</p>
            <h2>Flagged items only</h2>
          </div>
          {sevenDayStrip.length > 3 && (
            <button type="button" className="ghost-button compact-ghost" onClick={() => setStripExpanded(current => !current)}>
              {stripExpanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
        <div className="week-strip">
          {visibleSevenDayStrip.length === 0 ? (
            <p className="empty-message">No flagged items in the next seven days.</p>
          ) : (
            visibleSevenDayStrip.map(item => (
              <article key={item.id} className="week-strip-item">
                <strong>{item.label}</strong>
                <p>Flagged</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Quick capture</p>
            <h2>Access always stays close</h2>
          </div>
        </div>
        <p className="empty-message">Use the floating plus button or the top brain dump action.</p>
      </section>
    </div>
  );
}

function CalendarScreen({ weeklyItems, setWeeklyItems }) {
  const { tasks, meals, workouts } = useTaskContext();
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [draftBusyTitle, setDraftBusyTitle] = useState('');
  const [draftEventTitle, setDraftEventTitle] = useState('');
  const [draftStartTime, setDraftStartTime] = useState('09:00');
  const [draftEndTime, setDraftEndTime] = useState('10:00');
  const [patternOpen, setPatternOpen] = useState(false);
  const [savedPattern, setSavedPattern] = useState([]);

  const weekDays = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(now, index);
      const key = toDateKey(day);
      return {
        key,
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        dateLabel: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        isToday: sameDay(day, now),
      };
    });
  }, []);

  useEffect(() => {
    if (!weekDays.some(day => day.key === selectedDate)) {
      setSelectedDate(toDateKey(new Date()));
    }
  }, [selectedDate, weekDays]);

  const selectedItems = useMemo(
    () => [
      ...(selectedDate === toDateKey(new Date())
        ? tasks.map(task => ({
            id: task.id,
            type: 'task',
            title: task.title || 'Untitled task',
            subtitle: `${task.status} task`,
          }))
        : []),
      ...meals
        .filter(meal => toDateKey(meal.loggedAt) === selectedDate)
        .map(meal => ({
          id: meal.id,
          type: 'meal',
          title: meal.name || 'Meal',
          subtitle: meal.tags.length ? meal.tags.join(' · ') : 'Logged today',
        })),
      ...workouts
        .filter(workout => workout.status === 'active' || sameDay(workout.createdAt, selectedDate))
        .map(workout => ({
          id: workout.id,
          type: 'workout',
          title: workout.name,
          subtitle: `${workout.duration} min · ${workout.status}`,
        })),
      ...weeklyItems
        .filter(item => item.date === selectedDate)
        .map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          subtitle: `${item.startTime} - ${item.endTime}`,
        })),
    ],
    [meals, selectedDate, tasks, weeklyItems, workouts],
  );

  const selectedDateLabel = useMemo(() => formatFullDate(selectedDate), [selectedDate]);

  function updateWeeklyItem(itemId, updates) {
    setWeeklyItems(current => current.map(item => (item.id === itemId ? { ...item, ...updates } : item)));
  }

  function createScheduledItem(type) {
    const title = (type === 'busy' ? draftBusyTitle : draftEventTitle).trim();
    if (!title) return;

    const item = {
      id: `calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      date: selectedDate,
      startTime: draftStartTime,
      endTime: draftEndTime,
      notes: type === 'event' ? '' : undefined,
      repeatWeekly: false,
      priority: false,
    };

    setWeeklyItems(current => [item, ...current]);

    if (type === 'busy') {
      setDraftBusyTitle('');
    } else {
      setDraftEventTitle('');
    }
  }

  const visiblePatternItems = useMemo(
    () => selectedItems,
    [selectedItems],
  );

  function savePattern() {
    setSavedPattern(selectedItems);
    setWeeklyItems(current =>
      current.map(item => (
        item.date === selectedDate ? { ...item, repeatWeekly: true } : item
      )),
    );
    setPatternOpen(true);
  }

  return (
    <div className="tab-stack">
      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>Weekly preview</h2>
          </div>
          <div className="calendar-nav">
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, -1)))}>
              Previous
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(new Date()))}>
              Today
            </button>
            <button type="button" className="ghost-button compact-ghost" onClick={() => setSelectedDate(toDateKey(addDays(selectedDate, 1)))}>
              Next
            </button>
          </div>
        </div>
        <div className="calendar-month-control">
          <strong>{selectedDateLabel}</strong>
          <p>Month/date control</p>
        </div>
      </section>

      <section className="task-card">
        <div className="week-strip calendar-week-strip">
          {weekDays.map(day => (
            <button
              key={day.key}
              type="button"
              className={`week-strip-item ${selectedDate === day.key ? 'is-active' : ''} ${day.isToday ? 'is-today' : ''}`}
              onClick={() => setSelectedDate(day.key)}
            >
              <strong>{day.label}</strong>
              <p>{day.dateLabel}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="task-card calendar-detail-panel">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Selected day</p>
            <h2>{selectedDateLabel}</h2>
          </div>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button">Open daily</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('busy')}>Add busy</button>
          <button type="button" className="secondary-button" onClick={() => createScheduledItem('event')}>Add event</button>
        </div>
        <div className="subtle-feed">
          {selectedItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No items scheduled</strong>
              <p>Add a busy block or event below.</p>
            </div>
          ) : (
            selectedItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.type} · {item.startTime} - {item.endTime}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Add busy</p>
            <h2>Work time not tied to integrations</h2>
          </div>
        </div>
        <div className="calendar-form">
          <input
            className="task-title-input"
            value={draftBusyTitle}
            onChange={event => setDraftBusyTitle(event.target.value)}
            placeholder="Busy block title"
          />
          <div className="calendar-time-row">
            <input className="task-title-input" type="time" value={draftStartTime} onChange={event => setDraftStartTime(event.target.value)} />
            <input className="task-title-input" type="time" value={draftEndTime} onChange={event => setDraftEndTime(event.target.value)} />
          </div>
          <button type="button" className="primary-button" onClick={() => createScheduledItem('busy')}>Save busy block</button>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Add event</p>
            <h2>Manual event entry</h2>
          </div>
        </div>
        <div className="calendar-form">
          <input
            className="task-title-input"
            value={draftEventTitle}
            onChange={event => setDraftEventTitle(event.target.value)}
            placeholder="Event title"
          />
          <div className="calendar-time-row">
            <input className="task-title-input" type="time" value={draftStartTime} onChange={event => setDraftStartTime(event.target.value)} />
            <input className="task-title-input" type="time" value={draftEndTime} onChange={event => setDraftEndTime(event.target.value)} />
          </div>
          <button type="button" className="primary-button" onClick={() => createScheduledItem('event')}>Save event</button>
        </div>
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Schedule pattern</p>
            <h2>Save this schedule as a pattern</h2>
          </div>
        </div>
        <div className="subtle-feed">
          {visiblePatternItems.length === 0 ? (
            <div className="empty-panel">
              <strong>No visible pattern items</strong>
              <p>Selected-day items appear here before saving as a pattern.</p>
            </div>
          ) : (
            visiblePatternItems.map(item => (
              <article key={item.id} className="feed-card">
                <strong>{item.title}</strong>
                <p>{item.type} · weekly pattern ready</p>
              </article>
            ))
          )}
        </div>
        <button type="button" className="secondary-button" onClick={savePattern}>Save this schedule as a pattern</button>
        {patternOpen && <p className="empty-message">Pattern saved locally for repeat weekly use. {savedPattern.length} items captured.</p>}
      </section>

      <section className="task-card">
        <div className="task-card-header">
          <div>
            <p className="eyebrow">Integration</p>
            <h2>Connect Google</h2>
          </div>
        </div>
        <p className="empty-message">Optional prompt only. Settings remains the place for integration setup.</p>
        <button type="button" className="ghost-button compact-ghost">Connect Google</button>
      </section>
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

function FitnessScreen({ activeWorkoutId, onStartWorkout }) {
  const { workouts, setWorkouts, setNotifications, createNotification } = useTaskContext();
  const activeWorkout = useMemo(
    () => workouts.find(workout => workout.id === activeWorkoutId) ?? null,
    [workouts, activeWorkoutId],
  );

  function upsertNotification(title, detail) {
    setNotifications(current => [createNotification({ title, detail }), ...current]);
  }

  function startWorkout(workoutId) {
    onStartWorkout(workoutId);
    setWorkouts(current => current.map(workout => (
      workout.id === workoutId ? { ...workout, status: 'active' } : workout
    )));
  }

  function cancelWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'planned' } : workout
    )));
    onStartWorkout(null);
  }

  function completeWorkout() {
    if (!activeWorkoutId) return;

    setWorkouts(current => current.map(workout => (
      workout.id === activeWorkoutId ? { ...workout, status: 'completed' } : workout
    )));
    upsertNotification('Workout completed', activeWorkout?.name || 'Workout');
    onStartWorkout(null);
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
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [weeklyItems, setWeeklyItems] = useState(() => createCalendarSeed());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

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
            <DashboardScreen
              inboxCount={unreadNotifications.length}
              now={now}
              activeWorkoutId={activeWorkoutId}
              onStartWorkout={setActiveWorkoutId}
              calendarItems={weeklyItems}
            />
          </RootTabPanel>

          <RootTabPanel id="calendar" activeTab={activeTab}>
            <CalendarScreen weeklyItems={weeklyItems} setWeeklyItems={setWeeklyItems} />
          </RootTabPanel>

          <RootTabPanel id="nutrition" activeTab={activeTab}>
            <NutritionScreen />
          </RootTabPanel>

          <RootTabPanel id="fitness" activeTab={activeTab}>
            <FitnessScreen activeWorkoutId={activeWorkoutId} onStartWorkout={setActiveWorkoutId} />
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
