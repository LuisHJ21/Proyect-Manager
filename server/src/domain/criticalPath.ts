import { addDays, diffDays, type DependencyType } from '@pm/shared';

export type ScheduleTask = { id: string; startDate: string; dueDate: string };
export type ScheduleDependency = { predecessorId: string; successorId: string; type: DependencyType; lagDays: number };
export type ScheduleResult = {
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  totalFloat: number;
  critical: boolean;
};

/**
 * Orden topológico (Kahn) de las tareas según las dependencias. Lanza un error si hay un ciclo:
 * no debería pasar, porque los ciclos se rechazan al crear la dependencia.
 */
function topologicalOrder(ids: string[], deps: ScheduleDependency[]): string[] {
  const incoming = new Map(ids.map((id) => [id, 0]));
  for (const dep of deps) incoming.set(dep.successorId, (incoming.get(dep.successorId) ?? 0) + 1);
  const queue = ids.filter((id) => incoming.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of deps) {
      if (dep.predecessorId !== id) continue;
      const left = incoming.get(dep.successorId)! - 1;
      incoming.set(dep.successorId, left);
      if (left === 0) queue.push(dep.successorId);
    }
  }
  if (order.length !== ids.length) throw new Error('Las dependencias forman un ciclo');
  return order;
}

/**
 * Ruta crítica en días naturales sobre tareas con fechas. Hacia adelante, el inicio temprano es el
 * mayor entre el inicio planeado y lo que exige cada predecesora; hacia atrás, el fin tardío parte
 * del fin del proyecto (o del mayor fin temprano) y se acota con cada sucesora. Con S = inicio y
 * F = fin: FS S_suc ≥ F_pred + 1 + lag; SS S_suc ≥ S_pred + lag; FF F_suc ≥ F_pred + lag;
 * SF F_suc ≥ S_pred + lag. Una tarea es crítica si su holgura total es ≤ 0.
 */
export function criticalPath(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
  projectEnd: string | null,
): { tasks: Map<string, ScheduleResult>; critical: string[]; unscheduled: string[] } {
  const ids = new Set(tasks.map((t) => t.id));
  const unscheduled = [...new Set(dependencies.flatMap((d) => [d.predecessorId, d.successorId]).filter((id) => !ids.has(id)))];
  const deps = dependencies.filter((d) => ids.has(d.predecessorId) && ids.has(d.successorId));
  if (tasks.length === 0) return { tasks: new Map(), critical: [], unscheduled };

  // Fechas como número de día respecto a la más temprana.
  const origin = tasks.map((t) => t.startDate).sort()[0]!;
  const day = (date: string) => diffDays(origin, date);
  const date = (n: number) => addDays(origin, n);
  const duration = new Map(tasks.map((t) => [t.id, Math.max(1, diffDays(t.startDate, t.dueDate) + 1)]));
  const order = topologicalOrder(tasks.map((t) => t.id), deps);

  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const dur = duration.get(id)!;
    let start = day(tasks.find((t) => t.id === id)!.startDate);
    for (const dep of deps.filter((d) => d.successorId === id)) {
      const p = dep.predecessorId;
      const need =
        dep.type === 'FS' ? ef.get(p)! + 1 + dep.lagDays
        : dep.type === 'SS' ? es.get(p)! + dep.lagDays
        : dep.type === 'FF' ? ef.get(p)! + dep.lagDays - dur + 1
        : es.get(p)! + dep.lagDays - dur + 1;
      start = Math.max(start, need);
    }
    es.set(id, start);
    ef.set(id, start + dur - 1);
  }

  const end = projectEnd ? day(projectEnd) : Math.max(...ef.values());
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const dur = duration.get(id)!;
    let finish = end;
    for (const dep of deps.filter((d) => d.predecessorId === id)) {
      const s = dep.successorId;
      const limit =
        dep.type === 'FS' ? ls.get(s)! - 1 - dep.lagDays
        : dep.type === 'SS' ? ls.get(s)! - dep.lagDays + dur - 1
        : dep.type === 'FF' ? lf.get(s)! - dep.lagDays
        : lf.get(s)! - dep.lagDays + dur - 1;
      finish = Math.min(finish, limit);
    }
    lf.set(id, finish);
    ls.set(id, finish - dur + 1);
  }

  const results = new Map<string, ScheduleResult>();
  for (const id of order) {
    const totalFloat = ls.get(id)! - es.get(id)!;
    results.set(id, {
      earlyStart: date(es.get(id)!),
      earlyFinish: date(ef.get(id)!),
      lateStart: date(ls.get(id)!),
      lateFinish: date(lf.get(id)!),
      totalFloat,
      critical: totalFloat <= 0,
    });
  }
  return { tasks: results, critical: order.filter((id) => results.get(id)!.critical), unscheduled };
}

export type RescheduleChange = { id: string; from: { startDate: string; dueDate: string }; to: { startDate: string; dueDate: string } };

/**
 * Propone nuevas fechas para las sucesoras (directas e indirectas) de una tarea que ya no respetan
 * sus dependencias. Cada una se adelanta lo mínimo, conserva su duración y nunca se mueve hacia atrás.
 */
export function proposeReschedule(rootId: string, tasks: ScheduleTask[], dependencies: ScheduleDependency[]): RescheduleChange[] {
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));
  const deps = dependencies.filter((d) => byId.has(d.predecessorId) && byId.has(d.successorId));
  // Sucesoras alcanzables desde la tarea, en orden topológico.
  const reachable = new Set<string>();
  const walk = (id: string) => {
    for (const dep of deps) if (dep.predecessorId === id && !reachable.has(dep.successorId)) reachable.add(dep.successorId), walk(dep.successorId);
  };
  walk(rootId);
  const order = topologicalOrder([...byId.keys()], deps).filter((id) => reachable.has(id));

  const changes: RescheduleChange[] = [];
  for (const id of order) {
    const task = byId.get(id)!;
    const dur = Math.max(1, diffDays(task.startDate, task.dueDate) + 1);
    let start = task.startDate;
    for (const dep of deps.filter((d) => d.successorId === id)) {
      const p = byId.get(dep.predecessorId)!;
      const need =
        dep.type === 'FS' ? addDays(p.dueDate, 1 + dep.lagDays)
        : dep.type === 'SS' ? addDays(p.startDate, dep.lagDays)
        : dep.type === 'FF' ? addDays(p.dueDate, dep.lagDays - dur + 1)
        : addDays(p.startDate, dep.lagDays - dur + 1);
      if (need > start) start = need;
    }
    if (start === task.startDate) continue;
    const to = { startDate: start, dueDate: addDays(start, dur - 1) };
    changes.push({ id, from: { startDate: task.startDate, dueDate: task.dueDate }, to });
    byId.set(id, { ...task, ...to });
  }
  return changes;
}
