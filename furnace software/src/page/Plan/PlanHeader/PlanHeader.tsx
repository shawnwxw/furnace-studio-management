import type { PlanHeaderProps } from '../../../interface/planHeader';

// Shows the selected Plan tab and exposes the add button when the page supplies an add action.
export default function PlanHeader({ active, onAdd, addDisabled }: PlanHeaderProps) {
  return (
    <header className="page-header">
      <h1>Plan</h1>
      <div className="plan-header-actions">
        <nav className="plan-nav" aria-label="Plan navigation">
          <a href="/plan/task" aria-current={active === 'task' ? 'page' : undefined}>Tasks</a>
          <a href="/plan/calendar" aria-current={active === 'calendar' ? 'page' : undefined}>Calendar</a>
          <a href="/plan/task-history" aria-current={active === 'history' ? 'page' : undefined}>Task history</a>
        </nav>
        {onAdd && (
          <button type="button" className="page-add" aria-label="Add item"
            aria-haspopup="dialog" aria-disabled={addDisabled} onClick={onAdd}>+</button>
        )}
      </div>
    </header>
  );
}
