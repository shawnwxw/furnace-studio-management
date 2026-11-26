import { dataService } from '../../../dataService';
import type { TaskItem, TaskSnapshot, Priority } from '../../../interface/task';

export const priorities = { high: 'High', mid: 'Mid', low: 'Low' } as const satisfies Record<Priority, string>;
export const taskEndpoint = 'plans/task';

// Places each subtask directly after its main task in the saved order.
export function orderedTasks(items: TaskItem[]) {
  const childrenByParent = new Map<string, TaskItem[]>();
  for (const item of items) {
    if (!item.parentTaskId) continue;
    const children = childrenByParent.get(item.parentTaskId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentTaskId, children);
  }
  return items.filter(item => !item.parentTaskId)
    .flatMap(item => [item, ...(childrenByParent.get(item.id) ?? [])]);
}

// Move completed groups together and show the newest completed tasks first in history.
export function tasksForView(items: TaskItem[], history = false) {
  const roots = items.filter(item => !item.parentTaskId && item.completed === history);
  if (history) roots.sort((first, second) => (second.completedAt ?? '').localeCompare(first.completedAt ?? ''));
  const rootIds = new Set(roots.map(item => item.id));
  return orderedTasks([...roots, ...items.filter(item => item.parentTaskId && rootIds.has(item.parentTaskId))]);
}

// Count subtasks even when their rows are hidden or still finishing the completion animation.
export function subtaskProgressFor(items: TaskItem[], isCompleting: (id: string) => boolean) {
  const progressByTask = new Map<string, { completed: number; total: number }>();
  for (const item of items) {
    if (!item.parentTaskId) continue;
    const progress = progressByTask.get(item.parentTaskId) ?? { completed: 0, total: 0 };
    progress.total++;
    if (item.completed || isCompleting(item.id)) progress.completed++;
    progressByTask.set(item.parentTaskId, progress);
  }
  return progressByTask;
}

// Saves the replacement list only if it is based on the current revision.
export function saveTask(items: TaskItem[], revision: string) {
  return dataService.put<TaskSnapshot>(taskEndpoint, items, {
    headers: { 'If-Match': revision },
  });
}
