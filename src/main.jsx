import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Header from './components/Header.jsx';
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

  return (
    <div className="app-shell">
      <Header
        inboxCount={appState.inbox.length}
        onOpenBrainDump={() => setBrainDumpOpen(true)}
        onOpenInbox={() => setActiveView('inbox')}
      />

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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
