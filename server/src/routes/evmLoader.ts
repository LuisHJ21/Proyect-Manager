import type { PrismaClient } from '@prisma/client';
import { computeEvm } from '../domain/evm';
import type { EvmIndexes } from '../domain/health';
import { loadEvmInput } from './performance';

/** CPI y SPI de los proyectos que tienen línea base, para la regla de salud. */
export async function loadEvmIndexes(prisma: PrismaClient, projectIds: string[], today: string): Promise<Map<string, EvmIndexes>> {
  const withBaseline = await prisma.baseline.findMany({ where: { projectId: { in: projectIds } }, select: { projectId: true }, distinct: ['projectId'] });
  const entries = await Promise.all(
    withBaseline.map(async ({ projectId }) => {
      const input = await loadEvmInput(prisma, projectId);
      if (!input) return null;
      const { cpi, spi } = computeEvm(input, today).metrics;
      return [projectId, { cpi, spi }] as const;
    }),
  );
  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== null));
}
