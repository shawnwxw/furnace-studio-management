import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import LoadingSpinner from '../../common/LoadingSpinner/LoadingSpinner';
import { usePopups } from '../../common/Popup/PopupProvider';
import TrashIcon from '../../common/TrashIcon/TrashIcon';
import { ApiError, dataService } from '../../dataService';
import './Plan.css';
import { planColors, randomPlanColor, defaultPlanColor } from './planColors';
import PlanCalendar from './PlanCalendar/PlanCalendar';
import type { PlanProps, PlanSnapshot, Schedule } from '../../interface/calendar';

// Formats the local day for a date input so midnight UTC does not shift the selected day.
function todayDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const STORAGE_KEY = 'furnace-plan-schedules';
const calendarEndpoint = 'plans/calendar';

// Reads legacy browser records and converts older fields to the current schedule format.
function loadBrowserSchedules(): Schedule[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.flatMap((item): Schedule[] => {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
          typeof item.completed !== 'boolean') return [];
      // Keep schedules saved before the name, due time, and note fields were added.
      const name = typeof item.name === 'string' ? item.name : item.title;
      if (typeof name !== 'string') return [];
      const dueDate = (typeof item.dueDate === 'string' ? item.dueDate
        : typeof item.dueTime === 'string' ? item.dueTime
        : typeof item.date === 'string' ? item.date : '').slice(0, 10);
      const startDate = typeof item.startDate === 'string' ? item.startDate : dueDate.slice(0, 10) || todayDate();
      return [{ id: item.id, name, startDate, dueDate,
        color: typeof item.color === 'number' && Number.isFinite(item.color) && item.color >= 0 && item.color < 360 ? item.color : defaultPlanColor(item.id),
        note: typeof item.note === 'string' ? item.note : '', completed: item.completed }];
    });
  } catch {
    return [];
  }
}

// Coordinates the Calendar view, schedule editor, and API-backed schedule state.
export default function Plan({ dashboard = false }: PlanProps) {
  const { confirm } = usePopups();
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const schedules = snapshot?.schedules ?? [];
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayDate);
  const [dueDate, setDueDate] = useState('');
  const [color, setColor] = useState(randomPlanColor);
  const [note, setNote] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editedSchedule = schedules.find(item => item.id === editingId);
  const hasScheduleChanges = editedSchedule !== undefined && (
    name.trim() !== editedSchedule.name.trim() || startDate !== editedSchedule.startDate ||
    dueDate !== editedSchedule.dueDate || color !== editedSchedule.color || note.trim() !== editedSchedule.note.trim()
  );
  const canSaveSchedule = !saving && Boolean(name.trim() && startDate) &&
    (dueDate === '' || dueDate >= startDate) && (editingId === null || hasScheduleChanges);

  useEffect(() => {
    const controller = new AbortController();
    // Imports legacy schedules before clearing browser storage, or loads the saved API snapshot.
    async function load() {
      const legacy = dashboard ? [] : loadBrowserSchedules();
      const options = { signal: controller.signal };
      try {
        const plans = legacy.length
          ? await dataService.post<PlanSnapshot>(calendarEndpoint, legacy, options)
          : await dataService.get<PlanSnapshot>(calendarEndpoint, options);
        if (controller.signal.aborted) return;
        if (legacy.length) {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {
            // A later import safely skips IDs already saved by the API.
          }
        }
        setSnapshot(plans);
      } catch {
        if (!controller.signal.aborted) setLoadError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [dashboard, loadAttempt]);

  // Saves a revision-checked snapshot and refreshes the list when another session saved first.
  async function setSchedules(update: (current: Schedule[]) => Schedule[]) {
    if (!snapshot || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const next = update(snapshot.schedules);
      if (next === snapshot.schedules) return true;
      setSnapshot(await dataService.put<PlanSnapshot>(calendarEndpoint, next, {
        headers: { 'If-Match': snapshot.revision },
      }));
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 412) {
        try {
          setSnapshot(await dataService.get<PlanSnapshot>(calendarEndpoint));
          setSaveError('Plans changed in another session. Review the latest schedules and try again.');
        } catch {
          setSaveError('Could not refresh plans. Reload the page and try again.');
        }
      } else {
        setSaveError('Could not save plans. Try again.');
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Clears the editor and restores defaults for a new schedule.
  function resetForm() {
    setSaveError('');
    setName('');
    setStartDate(todayDate());
    setDueDate('');
    setNote('');
    setColor(randomPlanColor());
    setEditingId(null);
  }

  // Closes the schedule editor and discards its current form values.
  function closeForm() {
    dialogRef.current?.close();
    resetForm();
  }

  // Opens a fresh schedule editor with the selected calendar day as its start date.
  function addSchedule(date: string) {
    resetForm();
    setStartDate(date);
    dialogRef.current?.showModal();
  }

  // Validates the date range and closes the editor only after the API accepts the change.
  async function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingId && !editedSchedule) {
      setSaveError('This schedule was removed in another session.');
      return;
    }
    if (!canSaveSchedule) return;
    const trimmedName = name.trim();

    const saved = await setSchedules(current => editingId
      ? current.map(item => item.id === editingId ? { ...item, name: trimmedName, startDate, dueDate, color, note: note.trim() } : item)
      : [...current, { id: crypto.randomUUID(), name: trimmedName, startDate, dueDate, color, note: note.trim(), completed: false }]);
    if (saved) closeForm();
  }

  // Loads an existing schedule into the editor and keeps its ID for the update.
  function editSchedule(item: Schedule) {
    setSaveError('');
    setEditingId(item.id);
    setName(item.name);
    setStartDate(item.startDate);
    setDueDate(item.dueDate);
    setNote(item.note);
    setColor(item.color);
    dialogRef.current?.showModal();
  }

  // Moves the schedule by the number of days dragged and applies its new position in the list.
  function moveSchedule(id: string, targetDate: string, anchorDate: string, beforeId?: string) {
    setSchedules(current => {
      const item = current.find(schedule => schedule.id === id);
      if (!item || id === beforeId) return current;
      // Use calendar-day arithmetic so daylight-saving changes retain the date span.
      const dayNumber = (date: string) => {
        const [year, month, day] = date.split('-').map(Number);
        return Date.UTC(year, month - 1, day) / 86400000;
      };
      const shift = dayNumber(targetDate) - dayNumber(anchorDate);
      // Apply the same calendar-day offset to each date in the schedule.
      const shiftedDate = (date: string) => new Date((dayNumber(date) + shift) * 86400000).toISOString().slice(0, 10);
      const moved = { ...item, startDate: shiftedDate(item.startDate), dueDate: item.dueDate ? shiftedDate(item.dueDate) : '' };
      const remaining = current.filter(schedule => schedule.id !== id);
      const index = beforeId ? remaining.findIndex(schedule => schedule.id === beforeId) : -1;
      remaining.splice(index < 0 ? remaining.length : index, 0, moved);
      return remaining;
    });
  }

  // Confirm removal and close the editor only after the API saves the updated list.
  async function removeSchedule(schedule: Schedule) {
    if (savingRef.current) return;
    const confirmed = await confirm({
      title: 'Remove schedule',
      message: `Remove “${schedule.name}” from the calendar?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (confirmed && await setSchedules(current => current.filter(item => item.id !== schedule.id)) &&
        editingId === schedule.id) closeForm();
  }

  // Updates completion from either the calendar bar or the schedule list.
  function toggleScheduleCompleted(id: string) {
    void setSchedules(current => current.map(item => item.id === id ? { ...item, completed: !item.completed } : item));
  }

  return (
    <section className="plan-page">
      {!dashboard && <p>Add schedules and check them off as you finish.</p>}

      {loadError && (
        <p role="alert">Could not load plans. <button type="button" onClick={() => {
          setLoadError(false);
          setLoadAttempt(attempt => attempt + 1);
        }}>Try again</button></p>
      )}
      {!snapshot && !loadError && <LoadingSpinner label="Loading plans…" />}
      {saveError && <p role="alert">{saveError}</p>}
      {snapshot && <div inert={!dashboard && saving} aria-busy={saving}>
        <PlanCalendar todayAndTomorrow={dashboard} schedules={schedules} onEdit={editSchedule} onAdd={addSchedule} onMove={moveSchedule}
          onToggleCompleted={toggleScheduleCompleted} />
      </div>}

      {!dashboard && <dialog className="plan-dialog" ref={dialogRef} aria-labelledby="plan-form-heading"
        onCancel={event => event.preventDefault()}>
        <form className="plan-form" onSubmit={saveSchedule} inert={saving}>
          <h2 id="plan-form-heading">{editingId ? 'Edit schedule' : 'Add schedule'}</h2>
          {saveError && <p role="alert">{saveError}</p>}
          <label htmlFor="schedule-name">Name</label>
          <input id="schedule-name" value={name} onChange={event => setName(event.target.value)}
            placeholder="What needs to be done?" autoFocus required maxLength={200} />
          <label htmlFor="schedule-start-date">Start date</label>
          <input id="schedule-start-date" type="date" value={startDate}
            onChange={event => setStartDate(event.target.value)} required />
          <label htmlFor="schedule-due-date">Due date (optional)</label>
          <input id="schedule-due-date" type="date" value={dueDate} min={startDate}
            onChange={event => setDueDate(event.target.value)} />
          <fieldset className="plan-colors">
            <legend>Calendar colour</legend>
            <div className="plan-color-options">
              {planColors.map(option => (
                <label className="plan-color-option" key={option.hue} title={option.name}>
                  <input type="radio" name="schedule-color" value={option.hue}
                    aria-label={option.name}
                    checked={color === option.hue} onChange={() => setColor(option.hue)} />
                  <span style={{ background: `hsl(${option.hue} 65% 60%)` }}>
                    {color === option.hue ? '✓' : ''}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="schedule-note">Note</label>
          <textarea id="schedule-note" value={note} onChange={event => setNote(event.target.value)}
            placeholder="Add details about this schedule" rows={3} maxLength={2000} />
          <div className="plan-actions">
            <button className="plan-primary" type="submit" disabled={!canSaveSchedule}>
              {editingId ? 'Save changes' : 'Add schedule'}
            </button>
            <button type="button" onClick={closeForm}>Cancel</button>
            {editedSchedule && <button type="button" className="plan-remove schedule-remove"
              aria-label={`Remove ${editedSchedule.name}`} title="Remove schedule"
              onClick={() => void removeSchedule(editedSchedule)}>
              <TrashIcon />
            </button>}
          </div>
        </form>
      </dialog>}

      {!dashboard && snapshot && <div inert={saving}>
        <p className="plan-summary" role="status">
          {schedules.filter(item => item.completed).length} of {schedules.length} completed
        </p>
        {schedules.length === 0 ? <p>No schedules yet. Click a calendar date to add your first schedule.</p> : (
          <ul className="plan-list">
            {schedules.map(item => (
              <li className={`plan-item${item.completed ? ' plan-item--completed' : ''}`} key={item.id}>
                <label className="plan-item-content">
                  <input type="checkbox" checked={item.completed} onChange={() => toggleScheduleCompleted(item.id)} />
                  <span>
                    <span className="plan-item-name">{item.name}</span>
                    <time dateTime={item.startDate}>Starts: {new Date(`${item.startDate}T00:00:00`).toLocaleDateString()}</time>
                    {item.dueDate ? <time dateTime={item.dueDate}>Due: {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString()}</time>
                      : <span className="plan-item-note">No due date</span>}
                    {item.note && <span className="plan-item-note">{item.note}</span>}
                  </span>
                </label>
                <div className="plan-actions">
                  <button type="button" onClick={() => editSchedule(item)} aria-label={`Edit ${item.name}`}>Edit</button>
                  <button className="plan-remove" type="button" onClick={() => void removeSchedule(item)}
                    aria-label={`Remove ${item.name}`}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  );
}
