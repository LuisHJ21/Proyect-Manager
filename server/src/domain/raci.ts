import type { RaciWarning } from '@pm/shared';

/** Avisos de una fila RACI: falta una A, sobra una A o falta una R. */
export function raciWarnings(roles: string[]): RaciWarning[] {
  const count = (role: string) => roles.filter((r) => r === role).length;
  const warnings: RaciWarning[] = [];
  const accountable = count('A');
  if (accountable === 0) warnings.push('missing_a');
  if (accountable > 1) warnings.push('multiple_a');
  if (count('R') === 0) warnings.push('missing_r');
  return warnings;
}
