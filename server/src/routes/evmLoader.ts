import type { PrismaClient } from '@prisma/client';
import { computeEvm } from '../domain/evm';
import type { EvmIndexes } from '../domain/health';
import { loadEvmInputs } from './performance';

/** CPI y SPI de los proyectos que tienen línea base, para la regla de salud. */
export async function loadEvmIndexes(prisma: PrismaClient, projectIds: string[], today: string): Promise<Map<string, EvmIndexes>> {
  const inputs = await loadEvmInputs(prisma, projectIds);
  return new Map([...inputs].map(([projectId, input]) => {
    const { cpi, spi } = computeEvm(input, today).metrics;
    return [projectId, { cpi, spi }];
  }));
}
