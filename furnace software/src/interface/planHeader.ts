export interface PlanHeaderProps {
  active: 'task' | 'calendar' | 'history';
  onAdd?: () => void;
  addDisabled?: boolean;
}
