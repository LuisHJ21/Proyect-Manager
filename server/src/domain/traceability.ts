/** Se sugiere marcar cumplido un requisito aprobado cuyos entregables (al menos uno) están todos aceptados. */
export function suggestMet(req: { status: string; deliverables: { status: string }[] }): boolean {
  return req.status === 'APPROVED' && req.deliverables.length > 0 && req.deliverables.every((d) => d.status === 'ACCEPTED');
}

type TraceDeliverable = { id: string; number: number; name: string; status: string; tasks: { status: string }[]; criteria: { met: boolean }[] };
export type TraceabilityInput = {
  /** `description` ya en texto plano. */
  requirements: { id: string; number: number; description: string; status: string; priority: string; deliverableIds: string[] }[];
  deliverables: TraceDeliverable[];
};

/** Matriz requisito → entregable → tareas → criterios, más los entregables que no atiende ningún requisito. */
export function buildTraceability(input: TraceabilityInput) {
  const byId = new Map(input.deliverables.map((d) => [d.id, d]));
  const linked = new Set(input.requirements.flatMap((r) => r.deliverableIds));
  const row = (d: TraceDeliverable) => ({
    id: d.id,
    number: d.number,
    name: d.name,
    status: d.status,
    tasks: { done: d.tasks.filter((t) => t.status === 'DONE').length, total: d.tasks.length },
    criteria: { met: d.criteria.filter((c) => c.met).length, total: d.criteria.length },
  });
  return {
    requirements: [...input.requirements]
      .sort((a, b) => a.number - b.number)
      .map(({ deliverableIds, ...r }) => ({
        ...r,
        deliverables: deliverableIds
          .map((id) => byId.get(id))
          .filter((d): d is TraceDeliverable => d !== undefined)
          .sort((a, b) => a.number - b.number)
          .map(row),
      })),
    orphanDeliverables: input.deliverables
      .filter((d) => !linked.has(d.id))
      .sort((a, b) => a.number - b.number)
      .map(({ id, number, name }) => ({ id, number, name })),
  };
}
export type Traceability = ReturnType<typeof buildTraceability>;
