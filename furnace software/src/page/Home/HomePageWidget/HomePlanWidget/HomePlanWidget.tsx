import { useState } from 'react';
import Plan from '../../../Plan/Plan';
import HomeTask from './HomeTask';
import '../../../Plan/Plan.css';

// Switches between the dashboard's task list and calendar.
export default function HomePlanWidget() {
  // Mount only the selected view so its request and event listeners are cleaned up on tab changes.
  const [widget, setWidget] = useState<'task' | 'calendar'>('task');

  return (
    <div className="home-widget panel-frame">
      <div className="home-widget-switch" role="group" aria-label="Dashboard view">
        <button type="button" aria-pressed={widget === 'task'}
          onClick={() => setWidget('task')}>Tasks</button>
        <button type="button" className="home-calendar-tab" aria-pressed={widget === 'calendar'}
          aria-describedby="home-calendar-tip" onClick={() => setWidget('calendar')}>
          Calendar <span className="home-calendar-info" aria-hidden="true">ⓘ</span>
        </button>
        <span id="home-calendar-tip" className="home-calendar-tip" role="tooltip">
          Double-click a calendar item to tick it off.
        </span>
      </div>
      <div className="home-widget-content" role="region" tabIndex={0}
        aria-label={widget === 'task' ? 'Tasks widget' : 'Calendar widget'}>
        {widget === 'task' ? <HomeTask /> : <Plan dashboard />}
      </div>
    </div>
  );
}
