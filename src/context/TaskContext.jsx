import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const TASKS_STORAGE_KEY = 'purple-waffle-tasks-v1';

const TaskContext = createContext(null);

function generateId(prefix = 'task') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sortTasks(items) {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

function createTask(status = 'planned', overrides = {}) {
  const createdAt = Date.now();

  return {
    id: generateId('task'),
    title: '',
    subtasks: [],
    notes: '',
    status,
    createdAt,
    order: createdAt,
    ...overrides,
  };
}

function normalizeTask(task, index = 0) {
  return {
    id: task?.id || generateId('task'),
    title: typeof task?.title === 'string' ? task.title : '',
    subtasks: Array.isArray(task?.subtasks)
      ? task.subtasks.map(subtask => ({
          id: subtask?.id || generateId('subtask'),
          title: typeof subtask?.title === 'string' ? subtask.title : '',
          done: subtask?.done === true,
        }))
      : [],
    notes: typeof task?.notes === 'string' ? task.notes : '',
    status: ['inbox', 'planned', 'active', 'done'].includes(task?.status) ? task.status : 'inbox',
    createdAt: Number.isFinite(task?.createdAt) ? task.createdAt : Date.now() + index,
    order: Number.isFinite(task?.order) ? task.order : index,
  };
}

function loadInitialTasks() {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortTasks(parsed.map(normalizeTask));
  } catch {
    return [];
  }
}

export function TaskProvider({ children }) {
  const [tasks, setTasks] = useState(loadInitialTasks);

  useEffect(() => {
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const value = useMemo(() => ({
    tasks,
    setTasks,
    createTask,
    generateId,
    sortTasks,
  }), [tasks]);

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskContext() {
  const value = useContext(TaskContext);

  if (!value) {
    throw new Error('useTaskContext must be used inside TaskProvider');
  }

  return value;
}
