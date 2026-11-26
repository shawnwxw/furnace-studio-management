import { jsonStore, revision, snapshot, storageError } from './planStorage';
import type { TaskItem } from '../../interface/task';

// Fills fields missing from legacy task items and assigns the supplied position.
function withDefaults(item: TaskItem, order: number, childCompletion: Map<string, boolean>) {
  const isMainTask = item.isMainTask ?? childCompletion.has(item.id);
  return {
    ...item, note: item.note ?? '', priority: item.priority ?? 'mid', category: item.category ?? '',
    parentTaskId: item.parentTaskId ?? null, isMainTask,
    completed: isMainTask ? childCompletion.get(item.id) === true : item.completed, order,
  };
}

// A main task completes only when it has subtasks and every one is complete.
function completionByParent(items: TaskItem[]) {
  const completion = new Map<string, boolean>();
  for (const item of items) {
    if (item.parentTaskId) {
      completion.set(item.parentTaskId, item.completed && (completion.get(item.parentTaskId) ?? true));
    }
  }
  return completion;
}

// Validates task records while allowing older entries to omit newer fields.
function isTaskItem(value: unknown): value is TaskItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TaskItem>;
  return typeof item.id === 'string' && item.id.length > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 &&
    item.name.length <= 200 && typeof item.completed === 'boolean' &&
    (item.completedAt === undefined || (typeof item.completedAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(item.completedAt) &&
      Number.isFinite(Date.parse(item.completedAt)))) &&
    (item.note === undefined || (typeof item.note === 'string' && item.note.length <= 2000)) &&
    (item.priority === undefined || item.priority === 'high' || item.priority === 'mid' || item.priority === 'low') &&
    (item.category === undefined || (typeof item.category === 'string' && item.category.length <= 100)) &&
    (item.parentTaskId == null || (typeof item.parentTaskId === 'string' && item.parentTaskId.length > 0)) &&
    (item.isMainTask === undefined || typeof item.isMainTask === 'boolean') &&
    (item.order === undefined || (Number.isSafeInteger(item.order) && item.order >= 0));
}

const task = jsonStore('task.json', isTaskItem);

// Orders items by their saved position and uses file order for legacy records without a position.
function taskSnapshot(items: TaskItem[]) {
  // Older tasks with children become main tasks. Standalone tasks remain completable.
  const childCompletion = completionByParent(items);
  const ordered = items.map((item, index) => withDefaults(item, item.order ?? index, childCompletion))
    .sort((first, second) => first.order - second.order);
  return snapshot('items', items, ordered);
}

// Returns the ordered task and the revision of its stored data.
export async function getTask() {
  try {
    return taskSnapshot(await task.read());
  } catch (error) {
    return storageError('task', error);
  }
}

// Replaces the list after a revision check and stores each position from the submitted order.
export async function putTask(request: Request) {
  const incoming: unknown = await request.json().catch(() => null);
  if (!task.isList(incoming)) {
    return Response.json({ error: 'Expected a list of items with unique IDs.' }, { status: 400 });
  }

  try {
    const result = await task.update(current => {
      if (request.headers.get('If-Match') !== revision(current)) {
        return Response.json({ error: 'The task has changed. Reload before saving.' }, { status: 412 });
      }
      // Keep optional fields when a client submits an existing item without them.
      const currentById = new Map(current.map(item => [item.id, item]));
      const incomingIds = new Set(incoming.map(item => item.id));
      const mergedItems = incoming.map(item => {
        const merged = { ...currentById.get(item.id), ...item };
        // Older clients omit the parent field when removing a main task.
        if (item.parentTaskId === undefined && merged.parentTaskId && !incomingIds.has(merged.parentTaskId)) {
          merged.parentTaskId = null;
        }
        return merged;
      });
      const childCompletion = completionByParent(mergedItems);
      const next = mergedItems.map((item, index) => withDefaults(item, index, childCompletion));
      if (next.some(item => item.isMainTask && item.parentTaskId !== null)) {
        return Response.json({ error: 'A main task cannot have a parent task.' }, { status: 400 });
      }
      const mainTaskIds = new Set(next.filter(item => item.isMainTask).map(item => item.id));
      if (next.some(item => item.parentTaskId !== null && !mainTaskIds.has(item.parentTaskId))) {
        return Response.json({ error: 'A subtask must belong to an existing main task.' }, { status: 400 });
      }
      // Derive timestamps from the saved transition, including completion of a main task.
      const previousCompletion = completionByParent(current);
      const completionMinute = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
      return next.map(item => {
        const previous = currentById.get(item.id);
        const wasCompleted = previous && withDefaults(previous, 0, previousCompletion).completed;
        const completedAt = item.completed ? (wasCompleted ? previous?.completedAt : completionMinute) : undefined;
        return { ...item, completedAt };
      });
    });
    return result instanceof Response ? result : taskSnapshot(result);
  } catch (error) {
    return storageError('task', error);
  }
}
