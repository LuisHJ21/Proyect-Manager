export function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.projectId) ?? [];
    group.push(row);
    groups.set(row.projectId, group);
  }
  return groups;
}
