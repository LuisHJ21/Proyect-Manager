/** Se sugiere marcar cumplido un requisito aprobado cuyos entregables (al menos uno) están todos aceptados. */
export function suggestMet(req: { status: string; deliverables: { status: string }[] }): boolean {
  return req.status === 'APPROVED' && req.deliverables.length > 0 && req.deliverables.every((d) => d.status === 'ACCEPTED');
}
