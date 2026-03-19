export function derivePriorities(tasks) {
  const activeTasks = tasks.filter(task => task.status === 'active');
  const plannedTasks = tasks.filter(task => task.status === 'planned');

  return [...activeTasks, ...plannedTasks];
}
