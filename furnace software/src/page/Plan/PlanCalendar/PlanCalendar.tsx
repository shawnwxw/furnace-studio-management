import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, FocusEvent, MouseEvent } from 'react';
import type { DraggedSchedule, PlanCalendarProps, Schedule, ScheduleDetailsPosition } from '../../../interface/calendar';
import './PlanCalendar.css';

// Formats a schedule date as a compact label using the local calendar day.
function shortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// Converts a local calendar cell to the date key used by saved schedules.
function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Lays out schedules for the active view or the dashboard’s rolling two-day range.
export default function PlanCalendar({ todayAndTomorrow = false, schedules, onEdit, onAdd, onMove, onToggleCompleted }: PlanCalendarProps) {
  const [dragged, setDragged] = useState<DraggedSchedule | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovered, setHovered] = useState<ScheduleDetailsPosition | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('week');
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    // Dismiss details when scrolling or resizing makes their position stale.
    const hide = () => { clearTimeout(hideTimer.current); setHovered(null); };
    // Let Escape dismiss the details popup.
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(hideTimer.current);
      clearTimeout(clickTimer.current);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Positions schedule details beside the bar and flips them above it when space is limited.
  function showDetails(item: Schedule, element: HTMLElement) {
    clearTimeout(hideTimer.current);
    const rect = element.getBoundingClientRect();
    const above = window.innerHeight - rect.bottom < 280 && rect.top > 280;
    setHovered({ item, left: Math.max(12, Math.min(rect.left, window.innerWidth - 332)),
      top: above ? rect.top - 8 : rect.bottom + 8, above });
  }

  // Delays closing so the pointer can travel from the schedule bar to its details popup.
  function hideDetails() {
    hideTimer.current = setTimeout(() => setHovered(null), 150);
  }

  // Start month and week grids on Monday. The dashboard starts on the current local day.
  const month = selectedDate;
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = todayAndTomorrow ? 2
    : view === 'month' ? Math.ceil((offset + daysInMonth) / 7) * 7 : view === 'week' ? 7 : 1;
  const columns = todayAndTomorrow ? 2 : view === 'day' ? 1 : 7;
  const rangeStart = todayAndTomorrow ? now : view === 'month'
    ? new Date(month.getFullYear(), month.getMonth(), 1 - offset)
    : new Date(month.getFullYear(), month.getMonth(), month.getDate() - (view === 'week' ? (month.getDay() + 6) % 7 : 0));
  const days = Array.from({ length: cellCount }, (_, index) =>
    new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() + index));
  const heading = todayAndTomorrow ? undefined
    : view === 'month' ? month.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : view === 'day' ? month.toLocaleDateString([], { dateStyle: 'full' })
    : `${days[0].toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} – ${days[6].toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const dayLabels = !todayAndTomorrow && view === 'month'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : days.map(day => day.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }));

  // Pages by the active view and clamps month navigation to the target month’s last day.
  function navigate(direction: number) {
    setHovered(null);
    setSelectedDate(current => {
      if (view === 'month') {
        const target = new Date(current.getFullYear(), current.getMonth() + direction, 1);
        const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
        target.setDate(Math.min(current.getDate(), lastDay));
        return target;
      }
      return new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * (view === 'week' ? 7 : 1));
    });
  }

  return (
    <section className="plan-calendar" aria-label="Schedule calendar">
      {!todayAndTomorrow && <div className="plan-calendar-header">
        <div>
          <h2 id="calendar-month" aria-live="polite">{heading}</h2>
          <p className="plan-calendar-clock">{now.toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}</p>
        </div>
        <div className="calendar-controls">
          <div className="calendar-view-switch" role="group" aria-label="Calendar view">
            {(['week', 'month', 'day'] as const).map(option => (
              <button type="button" key={option} aria-pressed={view === option}
                onClick={() => { setHovered(null); setView(option); }}>{option[0].toUpperCase() + option.slice(1)}</button>
            ))}
          </div>
          <button type="button" className="plan-primary" aria-label="Add item" title="Add item" onClick={() => onAdd(dateKey(selectedDate))}>+</button>
          <div className="plan-actions">
          <button type="button" onClick={() => navigate(-1)} aria-label={`Previous ${view}`}>‹</button>
          <button type="button" onClick={() => setSelectedDate(new Date())}>Today</button>
          <button type="button" onClick={() => navigate(1)} aria-label={`Next ${view}`}>›</button>
          </div>
        </div>
      </div>}
      <div className="plan-calendar-scroll" role="region" aria-label={todayAndTomorrow ? 'Schedules for today and tomorrow' : `${view} schedules`} tabIndex={0}>
        <div className={`plan-calendar-grid plan-calendar-grid--${todayAndTomorrow ? 'two-days' : view}`}
          style={{ '--calendar-columns': columns } as CSSProperties} aria-labelledby={todayAndTomorrow ? undefined : 'calendar-month'}>
          <div className="calendar-weekdays">{dayLabels.map(day => <div key={day}>{day}</div>)}</div>
          {Array.from({ length: cellCount / columns }, (_, week) => {
            const weekDays = days.slice(week * columns, week * columns + columns);
            const weekStart = dateKey(weekDays[0]);
            const weekEnd = dateKey(weekDays[columns - 1]);
            const laneEnds: number[] = [];
            const segments = schedules
              .filter(item => item.startDate && item.startDate <= weekEnd &&
                (item.dueDate || item.startDate) >= weekStart && item.startDate <= (item.dueDate || item.startDate))
              .map(item => {
                const start = weekDays.findIndex(day => dateKey(day) >= item.startDate);
                let end = columns - 1;
                while (end > start && dateKey(weekDays[end]) > (item.dueDate || item.startDate)) end--;
                let lane = laneEnds.findIndex(last => last < start);
                if (lane === -1) lane = laneEnds.length;
                laneEnds[lane] = end;
                return { item, start, end, lane };
              });
            return (
              <div className="calendar-week" key={week}
                onDragOver={event => {
                  if (!dragged) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const column = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) / bounds.width * columns)));
                  setDropDate(dateKey(weekDays[column]));
                }}
                onDrop={event => {
                  if (!dragged) return;
                  event.preventDefault();
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const column = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - bounds.left) / bounds.width * columns)));
                  // Dropping on another schedule also sets the insertion point in the saved order.
                  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-plan-id]');
                  onMove(dragged.id, dateKey(weekDays[column]), dragged.anchor, target?.dataset.planId);
                  setDragged(null);
                  setDropDate(null);
                }} style={{ minHeight: Math.max(view === 'month' ? 140 : 320, 44 + laneEnds.length * 38) }}>
                <div className="calendar-week-days">
                  {weekDays.map(day => {
                    const key = dateKey(day);
                    const today = key === dateKey(now);
                    const className = `calendar-cell${view === 'month' && day.getMonth() !== month.getMonth() ? ' calendar-other-month' : ''}${today ? ' calendar-today' : ''}${dropDate === key ? ' calendar-drop-target' : ''}`;
                    const label = <time className="calendar-day" dateTime={key} aria-current={today ? 'date' : undefined}>{day.getDate()}</time>;
                    if (todayAndTomorrow) return <div key={key} className={className}>{label}</div>;
                    return <button type="button" onClick={() => onAdd(key)} aria-label={`Add schedule on ${day.toLocaleDateString([], { dateStyle: 'full' })}`} key={key} className={className}>
                      {label}
                    </button>;
                  })}
                </div>
                <div className="calendar-week-bars">
                  {segments.map(({ item, start, end, lane }) => {
                    const barProps = {
                      style: { gridColumn: `${start + 1} / ${end + 2}`, gridRow: lane + 1, '--plan-hue': item.color } as CSSProperties,
                      className: `calendar-bar${item.completed ? ' calendar-bar--completed' : ''}${dragged?.id === item.id ? ' calendar-bar--dragging' : ''}`,
                      'aria-describedby': hovered?.item.id === item.id ? 'calendar-item-details' : undefined,
                      onMouseEnter: (event: MouseEvent<HTMLElement>) => showDetails(item, event.currentTarget),
                      onMouseLeave: hideDetails,
                      onFocus: (event: FocusEvent<HTMLElement>) => showDetails(item, event.currentTarget),
                      onBlur: () => setHovered(null),
                    };
                    const content = <>
                      <strong>{item.completed ? '✓ ' : ''}{item.name}</strong>
                      <span className="calendar-bar-dates">{shortDate(item.startDate)}{item.dueDate ? ` – ${shortDate(item.dueDate)}` : ' · No due date'}</span>
                    </>;
                    if (todayAndTomorrow) {
                      return <button type="button" key={item.id} {...barProps}
                        aria-label={`Completion for ${item.name}`} aria-pressed={item.completed}
                        title="Double-click to toggle completion"
                        onDoubleClick={() => onToggleCompleted(item.id)}
                        onClick={event => {
                          if (event.detail === 0) onToggleCompleted(item.id);
                        }}>
                        {content}
                      </button>;
                    }
                    return <button type="button" key={item.id} draggable data-plan-id={item.id} {...barProps}
                      onDragStart={event => {
                        clearTimeout(clickTimer.current);
                        const bounds = event.currentTarget.getBoundingClientRect();
                        // Anchor the drag to the day grabbed within a multi-day bar.
                        const fraction = Math.max(0, Math.min(0.999, (event.clientX - bounds.left) / bounds.width));
                        const anchor = dateKey(weekDays[start + Math.floor(fraction * (end - start + 1))]);
                        event.dataTransfer.setData('text/plain', item.id);
                        event.dataTransfer.effectAllowed = 'move';
                        clearTimeout(hideTimer.current);
                        setHovered(null);
                        setDragged({ id: item.id, anchor });
                      }}
                      onDragEnd={() => { setDragged(null); setDropDate(null); }}
                      aria-label={`Edit ${item.name}, starts ${item.startDate}, due ${item.dueDate || 'No due date'}${item.completed ? ', completed' : ''}`}
                      onClick={event => {
                        clearTimeout(clickTimer.current);
                        setHovered(null);
                        // Open immediately for keyboard activation and wait briefly for a possible pointer double-click.
                        if (event.detail === 0) {
                          onEdit(item);
                        } else {
                          clickTimer.current = setTimeout(() => onEdit(item), 350);
                        }
                      }}
                      onDoubleClick={() => {
                        clearTimeout(clickTimer.current);
                        setHovered(null);
                        onToggleCompleted(item.id);
                      }}
                      onKeyDown={event => {
                        if (event.key.toLowerCase() === 'c') {
                          event.preventDefault();
                          onToggleCompleted(item.id);
                        }
                      }}>

                      {content}
                    </button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {hovered && createPortal(
        <div id="calendar-item-details" role="tooltip" className="calendar-item-details"
          onMouseEnter={() => clearTimeout(hideTimer.current)} onMouseLeave={hideDetails}
          style={{ left: hovered.left, top: hovered.top, transform: hovered.above ? 'translateY(-100%)' : undefined,
            '--plan-hue': hovered.item.color } as CSSProperties}>
          <h3>{hovered.item.name}</h3>
          <dl>
            <dt>Start date</dt><dd>{new Date(`${hovered.item.startDate}T00:00:00`).toLocaleDateString([], { dateStyle: 'long' })}</dd>
            <dt>Due date</dt><dd>{hovered.item.dueDate ? new Date(`${hovered.item.dueDate}T00:00:00`).toLocaleDateString([], { dateStyle: 'long' }) : 'No due date'}</dd>
            <dt>Status</dt><dd>{hovered.item.completed ? 'Completed' : 'Pending'}</dd>
            <dt>Note</dt><dd className="calendar-details-note">{hovered.item.note || 'No note'}</dd>
          </dl>
        </div>, document.body
      )}
      {!todayAndTomorrow && <p className="plan-calendar-hint">Click a date to add a schedule or a bar to edit. Double-click a bar to toggle completion (keyboard: C). Drag a bar to another date, or onto another item to place it before that item.</p>}
    </section>
  );
}
