import { addDays } from '@pm/shared';
import type { Task } from '../api/types';

export type QuickFilter = 'all' | 'mine' | 'high' | 'week';

const WEEK_DAYS = 7;

export function applyQuickFilter(tasks: Task[], filter: QuickFilter, { userId, today }: { userId?: string; today: string }): Task[] {
  switch (filter) {
    case 'all':
      return tasks;
    case 'mine':
      return tasks.filter((t) => t.assignees.some((a) => a.id === userId));
    case 'high':
      return tasks.filter((t) => t.priority === 'HIGH');
    case 'week': {
      const end = addDays(today, WEEK_DAYS);
      return tasks.filter((t) => t.status !== 'DONE' && t.dueDate !== null && t.dueDate >= today && t.dueDate <= end);
    }
  }
}
