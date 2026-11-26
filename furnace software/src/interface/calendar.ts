export interface Schedule {
  id: string;
  name: string;
  startDate: string;
  dueDate: string;
  note: string;
  color: number;
  completed: boolean;
}

export interface PlanSnapshot {
  schedules: Schedule[];
  revision: string;
}

export interface PlanProps {
  dashboard?: boolean;
}

export interface PlanCalendarProps {
  todayAndTomorrow?: boolean;
  schedules: Schedule[];
  onEdit: (schedule: Schedule) => void;
  onAdd: (date: string) => void;
  onToggleCompleted: (id: string) => void;
  onMove: (id: string, date: string, anchorDate: string, beforeId?: string) => void;
}

export interface DraggedSchedule {
  id: string;
  anchor: string;
}

export interface ScheduleDetailsPosition {
  item: Schedule;
  left: number;
  top: number;
  above: boolean;
}
