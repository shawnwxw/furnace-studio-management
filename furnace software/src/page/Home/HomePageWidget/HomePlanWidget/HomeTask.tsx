import { useEffect, useRef, useState } from 'react';
import LoadingSpinner from '../../../../common/LoadingSpinner/LoadingSpinner';
import { ApiError, dataService } from '../../../../dataService';
import type { TaskSnapshot } from '../../../../interface/task';
import { tasksForView, taskEndpoint, subtaskProgressFor, saveTask } from '../../../Plan/Task/taskData';
import { useTaskCompletion } from '../../../Plan/Task/useTaskCompletion';

// Displays saved items in API order and lets the user mark them complete.
export default function HomeTask() {
  const { animateCompletion, taskMotion } = useTaskCompletion();
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Cancel the request when the user switches away from this widget.
  useEffect(() => {
    const controller = new AbortController();
    dataService.get<TaskSnapshot>(taskEndpoint, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setTask(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  // Changes only the selected item and refreshes the snapshot if another session saved first.
  async function setCompleted(id: string, completed: boolean) {
    if (!task || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const items = task.items.map(item => item.id === id ? { ...item, completed } : item);
      const result = await saveTask(items, task.revision);
      await animateCompletion(task, result);
      setTask(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) {
        try {
          setTask(await dataService.get<TaskSnapshot>(taskEndpoint));
          setSaveError('The task list changed in another session. Review the latest items and try again.');
        } catch {
          setSaveError('Could not refresh the task list. Switch back to Tasks to reload it.');
        }
      } else {
        setSaveError('Could not update the task. Try again.');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const visibleTasks = task ? tasksForView(task.items) : [];
  const subtaskProgress = subtaskProgressFor(visibleTasks, id => taskMotion.has(id));

  return (
    <div className="home-task task">
      {loadFailed && <p role="alert">Could not load the task list.</p>}
      {saveError && <p role="alert">{saveError}</p>}
      {!task && !loadFailed && <LoadingSpinner label="Loading task list…" />}
      {task && (visibleTasks.length === 0 ? <p>No to-do items yet.</p> : (
        <ul className="plan-list home-task-items" aria-busy={saving}>
          {visibleTasks.map(item => {
            const TaskContent = item.isMainTask ? 'div' : 'label';
            const motion = taskMotion.get(item.id);
            const completed = item.completed || motion !== undefined;
            const progress = subtaskProgress.get(item.id) ?? { completed: 0, total: 0 };
            return (
              <li className={`plan-item${completed ? ' plan-item--completed' : ''}`} data-task-motion={motion}
                data-priority={item.priority} data-subtask={Boolean(item.parentTaskId)} key={item.id}>
                <TaskContent className="plan-item-content">
                  {!item.isMainTask && <input type="checkbox" aria-label={item.name} checked={completed} aria-disabled={saving}
                    onChange={event => void setCompleted(item.id, event.target.checked)} />}
                  <span className="plan-item-name">{item.name}</span>
                  {item.isMainTask && <span className="home-task-progress"
                    aria-label={`${progress.completed} of ${progress.total} subtasks completed`}>
                    {progress.completed}/{progress.total}
                  </span>}
                </TaskContent>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
