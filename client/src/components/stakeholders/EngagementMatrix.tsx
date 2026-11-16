import { ENGAGEMENT_LEVEL, LABELS } from '@pm/shared';
import type { Stakeholder } from '../../api/types';
import { Card } from '../ui';

/** Hay brecha cuando el nivel actual y el deseado están evaluados y difieren. */
export const hasEngagementGap = (s: Stakeholder) => s.currentEngagement != null && s.desiredEngagement != null && s.currentEngagement !== s.desiredEngagement;

/** Matriz de involucramiento: A = actual, D = deseado. */
export function EngagementMatrix({ stakeholders }: { stakeholders: Stakeholder[] }) {
  const gaps = stakeholders.filter(hasEngagementGap).length;
  return (
    <Card title="Matriz de involucramiento">
      <p className="mb-3 text-sm text-ink-nav">{gaps === 1 ? '1 interesado con brecha' : `${gaps} interesados con brecha`}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 text-left text-xs font-medium text-ink-soft">Interesado</th>
              {ENGAGEMENT_LEVEL.map((level) => (
                <th key={level} className="p-2 text-center text-xs font-medium text-ink-soft">
                  {LABELS.engagement[level]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stakeholders.map((s) => {
              const gap = hasEngagementGap(s);
              return (
                <tr key={s.id} data-gap={gap ? 'true' : undefined} className={`border-t border-line ${gap ? 'bg-warn-bg' : ''}`}>
                  <td className="p-2 text-ink">{s.name}</td>
                  {ENGAGEMENT_LEVEL.map((level) => {
                    const marks = [s.currentEngagement === level ? 'A' : '', s.desiredEngagement === level ? 'D' : ''].filter(Boolean).join(' ');
                    return (
                      <td key={level} className="p-2 text-center font-semibold text-ink">
                        {marks}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-soft">A: actual · D: deseado</p>
    </Card>
  );
}
