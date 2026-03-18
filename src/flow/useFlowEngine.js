import { useState, useCallback } from 'react';

const TEMPLATES = {
  work: [
    { id: 'w1', title: 'Morning intention', duration: 5, category: 'mindset' },
    { id: 'w2', title: 'Process inbox', duration: 15, category: 'admin' },
    { id: 'w3', title: 'Deep work block #1', duration: 90, category: 'focus' },
    { id: 'w4', title: 'Move your body', duration: 10, category: 'body' },
    { id: 'w5', title: 'Deep work block #2', duration: 60, category: 'focus' },
    { id: 'w6', title: 'End-of-day capture', duration: 10, category: 'admin' },
  ],
  low_energy: [
    { id: 'l1', title: 'Gentle start — no screens', duration: 10, category: 'mindset' },
    { id: 'l2', title: 'Light admin tasks', duration: 20, category: 'admin' },
    { id: 'l3', title: 'Short walk outside', duration: 15, category: 'body' },
    { id: 'l4', title: 'One small win', duration: 30, category: 'focus' },
    { id: 'l5', title: 'Rest or nap', duration: 20, category: 'rest' },
  ],
  off: [
    { id: 'o1', title: 'Slow morning — no agenda', duration: 30, category: 'mindset' },
    { id: 'o2', title: 'Something you enjoy', duration: 60, category: 'leisure' },
    { id: 'o3', title: 'Get outside', duration: 30, category: 'body' },
    { id: 'o4', title: 'Connect with someone', duration: 30, category: 'social' },
    { id: 'o5', title: 'Wind down early', duration: 20, category: 'rest' },
  ],
  reset: [
    { id: 'r1', title: 'Declutter one space', duration: 20, category: 'home' },
    { id: 'r2', title: 'Admin — bills, emails, forms', duration: 30, category: 'admin' },
    { id: 'r3', title: 'Meal prep', duration: 45, category: 'food' },
    { id: 'r4', title: 'Plan the week ahead', duration: 20, category: 'planning' },
    { id: 'r5', title: 'Tidy digital spaces', duration: 15, category: 'admin' },
  ],
};

export function useFlowEngine(dayType) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const queue = dayType ? TEMPLATES[dayType] ?? [] : [];

  const currentTask = queue[currentIndex] ?? null;

  const completeTask = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, queue.length));
  }, [queue.length]);

  const skipTask = useCallback(() => {
    setCurrentIndex(i => Math.min(i + 1, queue.length));
  }, [queue.length]);

  const swapTask = useCallback(() => {
    const remaining = queue.length - currentIndex;
    if (remaining > 1) {
      setCurrentIndex(i => Math.min(i + 1, queue.length));
    }
  }, [queue.length, currentIndex]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  return {
    queue,
    currentTask,
    currentIndex,
    totalTasks: queue.length,
    isDone: currentIndex >= queue.length,
    completeTask,
    skipTask,
    swapTask,
    reset,
  };
}
