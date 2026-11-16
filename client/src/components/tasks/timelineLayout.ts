import { diffDays } from '@pm/shared';

export const ROW_HEIGHT = 36;
const BAR_HEIGHT = 20;
/** Una tarea padre se dibuja como barra de resumen, más fina. */
const SUMMARY_BAR_HEIGHT = 10;

export type TimelineTask = { id: string; startDate: string | null; dueDate: string | null; predecessorIds: string[]; isSummary?: boolean };
export type TimelineMilestone = { id: string; dueDate: string };

type Bar = { taskId: string; x: number; y: number; width: number; height: number; summary: boolean };

export function buildTimelineLayout(tasks: TimelineTask[], milestones: TimelineMilestone[], dayWidth: number) {
  const dated = tasks.filter((t) => t.startDate && t.dueDate);
  const undated = tasks.filter((t) => !t.startDate || !t.dueDate).map((t) => t.id);

  const dates = [...dated.flatMap((t) => [t.startDate!, t.dueDate!]), ...milestones.map((m) => m.dueDate)].sort();
  const rangeStart = dates[0] ?? '';
  const rangeEnd = dates[dates.length - 1] ?? '';
  const xOf = (date: string) => diffDays(rangeStart, date) * dayWidth;

  const bars: Bar[] = dated.map((task, index) => {
    const height = task.isSummary ? SUMMARY_BAR_HEIGHT : BAR_HEIGHT;
    return {
      taskId: task.id,
      x: xOf(task.startDate!),
      y: index * ROW_HEIGHT + (ROW_HEIGHT - height) / 2,
      width: (diffDays(task.startDate!, task.dueDate!) + 1) * dayWidth,
      height,
      summary: Boolean(task.isSummary),
    };
  });
  const barByTask = new Map(bars.map((bar) => [bar.taskId, bar]));

  const arrows = dated.flatMap((task) =>
    task.predecessorIds.flatMap((predecessorId) => {
      const from = barByTask.get(predecessorId);
      const to = barByTask.get(task.id);
      if (!from || !to) return [];
      const startX = from.x + from.width;
      const startY = from.y + from.height / 2;
      const endX = to.x;
      const endY = to.y + to.height / 2;
      const elbowX = Math.max(startX + 6, endX - 6);
      return [{ from: predecessorId, to: task.id, path: `M ${startX} ${startY} H ${elbowX} V ${endY} H ${endX}` }];
    }),
  );

  return {
    bars,
    arrows,
    milestones: milestones.map((m) => ({ id: m.id, x: xOf(m.dueDate) })),
    undated,
    rangeStart,
    rangeEnd,
  };
}
