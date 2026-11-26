export type Priority = 'high' | 'mid' | 'low';
export interface TaskItemDetails {
  name: string;
  note: string;
  priority: Priority;
  category: string;
  parentTaskId: string | null;
  isMainTask: boolean;
}

export interface TaskItem extends TaskItemDetails {
  id: string;
  completed: boolean;
  completedAt?: string;
}

export interface TaskProps {
  history?: boolean;
}

export interface TaskSnapshot {
  items: TaskItem[];
  revision: string;
}

export type DropPosition = 'before' | 'after';

export interface TaskDropTarget {
  id: string;
  position: DropPosition;
}
