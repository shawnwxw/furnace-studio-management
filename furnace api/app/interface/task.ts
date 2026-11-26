export interface TaskItem {
  id: string;
  name: string;
  completed: boolean;
  completedAt?: string;
  note?: string;
  priority?: 'high' | 'mid' | 'low';
  category?: string;
  order?: number;
  parentTaskId?: string | null;
  isMainTask?: boolean;
}
