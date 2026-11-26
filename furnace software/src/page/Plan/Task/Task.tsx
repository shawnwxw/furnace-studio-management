import { useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import LoadingSpinner from '../../../common/LoadingSpinner/LoadingSpinner';
import TrashIcon from '../../../common/TrashIcon/TrashIcon';
import { ApiError, dataService } from '../../../dataService';
import { usePopups } from '../../../common/Popup/PopupProvider';
import PlanHeader from '../PlanHeader/PlanHeader';
import { taskEndpoint, priorities, saveTask, subtaskProgressFor, tasksForView } from './taskData';
import { useTaskCompletion } from './useTaskCompletion';
import type {
  TaskDropTarget, TaskItem, TaskItemDetails, TaskProps, TaskSnapshot, DropPosition, Priority,
} from '../../../interface/task';
import '../Plan.css';

const emptyDetails: TaskItemDetails = {
  name: '', note: '', priority: 'mid', category: '', parentTaskId: null, isMainTask: false,
};
const completionDate = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
// Chooses the insertion side from the pointer position relative to the row midpoint.
function dropPosition(event: DragEvent<HTMLLIElement>): DropPosition {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  return event.clientY < top + height / 2 ? 'before' : 'after';
}

// Displays saved tasks and manages editing, completion, removal, and reordering.
export default function Task({ history = false }: TaskProps) {
  const { confirm } = usePopups();
  const { animateCompletion, taskMotion } = useTaskCompletion();
  const [task, setTask] = useState<TaskSnapshot | null>(null);
  const [details, setDetails] = useState(emptyDetails);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const draggedId = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskDropTarget | null>(null);
  const [collapsedTasks, setCollapsedTasks] = useState(() => new Set<string>());
  const hasSubtasks = editingId !== null && task?.items.some(item => item.parentTaskId === editingId);
  const mainTasks = task?.items.filter(item => item.isMainTask && item.id !== editingId) ?? [];
  const editedTask = task?.items.find(item => item.id === editingId);
  const visibleTasks = task ? tasksForView(task.items, history) : [];
  const subtaskProgress = subtaskProgressFor(visibleTasks, id => taskMotion.has(id));
  const hasTaskChanges = editedTask !== undefined && (
    details.name.trim() !== editedTask.name.trim() || details.note.trim() !== editedTask.note.trim() ||
    details.priority !== editedTask.priority || details.category.trim() !== editedTask.category.trim() ||
    details.parentTaskId !== (editedTask.parentTaskId ?? null) || details.isMainTask !== editedTask.isMainTask
  );
  const canSaveTask = task !== null && !saving && Boolean(details.name.trim()) &&
    (editingId === null || hasTaskChanges);

  // Opens a blank form for a new item or copies only editable fields from an existing item.
  function openItemDialog(item?: TaskItem) {
    if (!task || savingRef.current) return;
    setError('');
    setEditingId(item?.id ?? null);
    setDetails(item ? {
      name: item.name, note: item.note, priority: item.priority, category: item.category,
      parentTaskId: item.parentTaskId ?? null,
      isMainTask: item.isMainTask,
    } : emptyDetails);
    dialogRef.current?.showModal();
  }

  // Fetch the latest revision on mount and whenever a failed or conflicting request triggers a retry.
  useEffect(() => {
    const controller = new AbortController();
    dataService.get<TaskSnapshot>(taskEndpoint, { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) setTask(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load the task list.');
      });
    return () => controller.abort();
  }, [attempt]);

  // Saves the task against its current revision and reloads it after a conflict.
  async function save(items: TaskItem[]) {
    if (!task || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await saveTask(items, task.revision);
      await animateCompletion(task, result, history);
      setTask(result);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 412) {
        setTask(null);
        setAttempt(current => current + 1);
        setError('The task list changed in another session. Review the latest items and try again.');
      } else {
        setError('Could not save the task list. Try again.');
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Preserve regular task completion. The API calculates completion for main tasks.
  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = details.name.trim();
    if (!name || !task) return;
    if (editingId && !editedTask) {
      setError('This item was removed in another session.');
      return;
    }
    if (!canSaveTask) return;
    if (details.parentTaskId && (details.isMainTask || !mainTasks.some(item => item.id === details.parentTaskId))) {
      setError('Choose an available main task as the parent.');
      return;
    }
    const fields = { ...details, name, note: details.note.trim(), category: details.category.trim() };
    const items = editingId
      ? task.items.map(item => item.id === editingId
        ? { ...item, ...fields, completed: !fields.isMainTask && item.completed }
        : item)
      : [...task.items, { ...fields, id: crypto.randomUUID(), completed: false }];
    if (await save(items)) dialogRef.current?.close();
  }

  // Asks for confirmation before saving the list without the selected item.
  async function removeItem(item: TaskItem) {
    if (!task || savingRef.current) return;
    const confirmed = await confirm({
      title: 'Remove task',
      message: task.items.some(current => current.parentTaskId === item.id)
        ? `Remove “${item.name}”? Its subtasks will become standalone tasks.`
        : `Remove “${item.name}” from the task list?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;
    void save(task.items.filter(current => current.id !== item.id).map(current =>
      current.parentTaskId === item.id ? { ...current, parentTaskId: null } : current));
  }

  // Reorders by ID and saves only when the drop changes the item’s position.
  function moveItem(id: string, targetId: string, position: DropPosition) {
    if (!task || savingRef.current || id === targetId) return;
    const items = [...task.items];
    const from = items.findIndex(item => item.id === id);
    const target = items.findIndex(item => item.id === targetId);
    if (from < 0 || target < 0 || (items[from].parentTaskId ?? null) !== (items[target].parentTaskId ?? null)) return;
    // Adjust the insertion index when removal shifts the target one slot earlier.
    const to = target + (position === 'after' ? 1 : 0) - (from < target ? 1 : 0);
    if (from === to) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    void save(items);
  }

  // Clears the dragged item and insertion marker after a drop or cancellation.
  function endDrag() {
    draggedId.current = null;
    setDropTarget(null);
  }

  // Folding changes only which rows are shown. Progress still includes every subtask.
  function toggleSubtasks(id: string) {
    setCollapsedTasks(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="page-frame">
      <PlanHeader active={history ? 'history' : 'task'}
        onAdd={history ? undefined : () => openItemDialog()} addDisabled={!task || saving} />
      <section className="plan-page task page-panel panel-frame">
        {error && <p role="alert">{error}</p>}
        {!task && (error === 'Could not load the task list.'
          ? <button type="button" onClick={() => {
            setError('');
            setAttempt(current => current + 1);
          }}>Try again</button>
          : <LoadingSpinner label="Loading task list…" />)}
        {task && (visibleTasks.length === 0 ? <p>{history ? 'No completed tasks yet.' : 'No to-do items yet.'}</p> : (
          <ul className="plan-list">
            {visibleTasks.map(item => {
              if (item.parentTaskId && collapsedTasks.has(item.parentTaskId)) return null;
              const siblings = visibleTasks.filter(current => (current.parentTaskId ?? null) === (item.parentTaskId ?? null));
              const index = siblings.findIndex(current => current.id === item.id);
              const TaskContent = item.isMainTask ? 'div' : 'label';
              const motion = taskMotion.get(item.id);
              const completed = item.completed || motion !== undefined;
              const progress = subtaskProgress.get(item.id) ?? { completed: 0, total: 0 };
              const expanded = !collapsedTasks.has(item.id);
              const progressTipId = `task-progress-${encodeURIComponent(item.id)}`;
              return (
              <li className={`plan-item${completed ? ' plan-item--completed' : ''}`} data-task-motion={motion}
                data-priority={item.priority} key={item.id}
                data-subtask={Boolean(item.parentTaskId)}
                data-drop-position={dropTarget?.id === item.id ? dropTarget.position : undefined}
                onDragOver={event => {
                  const id = draggedId.current;
                  if (!id || savingRef.current || !siblings.some(current => current.id === id)) return;
                  event.preventDefault();
                  const position = dropPosition(event);
                  setDropTarget(current => {
                    if (id === item.id) return null;
                    return current?.id === item.id && current.position === position
                      ? current : { id: item.id, position };
                  });
                }}
                onDragLeave={event => {
                  if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
                  setDropTarget(current => current?.id === item.id ? null : current);
                }}
                onDrop={event => {
                  const id = draggedId.current;
                  if (!id) return;
                  event.preventDefault();
                  endDrag();
                  moveItem(id, item.id, dropPosition(event));
                }}>
                {!history && <button type="button" className="task-drag" draggable={!saving && siblings.length > 1}
                  aria-disabled={saving || siblings.length < 2}
                  aria-label={`Reorder ${item.name} with the up and down arrow keys`}
                  title="Drag to reorder or use the up and down arrow keys"
                  onDragStart={event => {
                    draggedId.current = item.id;
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', item.id);
                  }}
                  onDragEnd={endDrag}
                  onKeyDown={event => {
                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                    event.preventDefault();
                    const up = event.key === 'ArrowUp';
                    const neighbor = siblings[index + (up ? -1 : 1)];
                    if (neighbor) moveItem(item.id, neighbor.id, up ? 'before' : 'after');
                  }}>
                  <span aria-hidden="true">⠿</span>
                </button>}
                <TaskContent className="plan-item-content">
                  {item.isMainTask && completed &&
                    <span className="task-completion-tick" role="img" aria-label="All subtasks complete">✓</span>}
                  {!item.isMainTask && <input type="checkbox" aria-label={item.name} checked={completed} disabled={saving}
                    onChange={event => {
                      const completed = event.target.checked;
                      void save(task.items.map(current =>
                        current.id === item.id ? { ...current, completed } : current));
                    }} />}
                  <span>
                    <span className="plan-item-name">{item.name}</span>
                    <span className="task-meta">
                      {item.isMainTask && <span>Main task</span>}
                      {item.parentTaskId && <span>Subtask</span>}
                      <span>{priorities[item.priority]} priority</span>
                      {item.category && <span>{item.category}</span>}
                      {item.completed && (item.completedAt
                        ? <time dateTime={item.completedAt}>Completed {completionDate.format(new Date(item.completedAt))}</time>
                        : <span>Completion time unavailable</span>)}
                    </span>
                    {item.note && <span className="plan-item-note task-note">{item.note}</span>}
                  </span>
                </TaskContent>
                <div className="plan-actions">
                  {item.isMainTask && <div className="task-progress">
                    <button type="button" className="task-action-icon task-progress-info"
                      aria-label="Subtask progress" aria-describedby={progressTipId}
                      onClick={event => event.currentTarget.focus()}>
                      <span aria-hidden="true">ⓘ</span>
                    </button>
                    <span id={progressTipId} className="task-progress-tip" role="tooltip">
                      {progress.completed} of {progress.total} {progress.total === 1 ? 'subtask' : 'subtasks'} complete.
                      {' '}{progress.total - progress.completed} in progress.
                    </span>
                  </div>}
                  <button type="button" className="task-action-icon" disabled={saving} onClick={() => openItemDialog(item)}
                    aria-label={`Edit ${item.name}`} title="Edit task"><span aria-hidden="true">✎</span></button>
                  <button type="button" className="task-action-icon plan-remove" disabled={saving}
                    onClick={() => removeItem(item)}
                    aria-label={`Remove ${item.name}`} title="Remove task"><TrashIcon /></button>
                  {item.isMainTask && progress.total > 0 && <button type="button" className="task-action-icon task-subtask-toggle"
                    aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} subtasks for ${item.name}`}
                    title={expanded ? 'Hide subtasks' : 'Show subtasks'} disabled={saving}
                    onClick={() => toggleSubtasks(item.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>}
                </div>
              </li>
              );
            })}
          </ul>
        ))}
        <dialog className="plan-dialog" ref={dialogRef} aria-labelledby="task-dialog-title"
          onCancel={event => event.preventDefault()}>
          <form className="plan-form" onSubmit={submitItem}>
            <h2 id="task-dialog-title">{editingId ? 'Edit task' : 'Add task'}</h2>
            {error && <p role="alert">{error}</p>}
            <label htmlFor="task-item">Name</label>
            <input id="task-item" value={details.name} maxLength={200} required autoFocus
              readOnly={saving} onChange={event => setDetails({ ...details, name: event.target.value })} />
            <label className="task-main-option">
              <input type="checkbox" checked={details.isMainTask} disabled={saving || hasSubtasks}
                onChange={event => setDetails({
                  ...details, isMainTask: event.target.checked,
                  parentTaskId: event.target.checked ? null : details.parentTaskId,
                })} />
              Main task
            </label>
            {hasSubtasks && <small>Move this task’s subtasks before changing its main task status.</small>}
            {!details.isMainTask && <>
              <label htmlFor="task-parent">Parent task</label>
              <select id="task-parent" value={details.parentTaskId ?? ''} disabled={saving}
                onChange={event => setDetails({ ...details, parentTaskId: event.target.value || null })}>
                <option value="">None (standalone task)</option>
                {mainTasks.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </>}
            <label htmlFor="task-note">Note</label>
            <textarea id="task-note" value={details.note} maxLength={2000} rows={3}
              readOnly={saving} onChange={event => setDetails({ ...details, note: event.target.value })} />
            <label htmlFor="task-priority">Priority</label>
            <select id="task-priority" value={details.priority} disabled={saving}
              onChange={event => setDetails({ ...details, priority: event.target.value as Priority })}>
              {Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label htmlFor="task-category">Category</label>
            <input id="task-category" value={details.category} maxLength={100}
              readOnly={saving} onChange={event => setDetails({ ...details, category: event.target.value })} />
            <div className="plan-actions">
              <button type="submit" className="plan-primary" disabled={!canSaveTask}>
                {editingId ? 'Save changes' : 'Add task'}
              </button>
              <button type="button" disabled={saving} onClick={() => dialogRef.current?.close()}>Cancel</button>
            </div>
          </form>
        </dialog>
      </section>
    </section>
  );
}
