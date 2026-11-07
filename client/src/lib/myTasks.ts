import type { Task } from '../api/types';

export type MyTaskGroups = { overdue: Task[]; today: Task[]; upcoming: Task[]; undated: Task[] };

export function groupMyTasks(tasks: Task[], today: string, options: { includeDone?: boolean } = {}): MyTaskGroups {
  const groups: MyTaskGroups = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const task of tasks) {
    const done = task.status === 'DONE';
    if (done && !options.includeDone) continue;
    if (!task.dueDate) groups.undated.push(task);
    else if (task.dueDate === today) groups.today.push(task);
    else if (task.dueDate < today && !done) groups.overdue.push(task);
    else groups.upcoming.push(task);
  }
  return groups;
}
