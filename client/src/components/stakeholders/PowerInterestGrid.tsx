import { LABELS, type Level } from '@pm/shared';
import type { Stakeholder } from '../../api/types';
import { Card } from '../ui';

const ROWS: Level[] = ['HIGH', 'MEDIUM', 'LOW'];
const COLS: Level[] = ['LOW', 'MEDIUM', 'HIGH'];
/** Rótulos de los cuadrantes extremos: influencia, interés. */
const QUADRANT: Partial<Record<`${Level}-${Level}`, string>> = {
  'HIGH-HIGH': 'Gestionar de cerca',
  'HIGH-LOW': 'Mantener satisfecho',
  'LOW-HIGH': 'Mantener informado',
  'LOW-LOW': 'Monitorear',
};

/** Cuadrícula poder (influencia) / interés con los interesados en su celda. */
export function PowerInterestGrid({ stakeholders }: { stakeholders: Stakeholder[] }) {
  return (
    <Card title="Cuadrícula poder / interés">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-28 p-2 text-left text-xs font-medium text-ink-soft">Influencia \ Interés</th>
              {COLS.map((interest) => (
                <th key={interest} className="p-2 text-left text-xs font-medium text-ink-soft">
                  {LABELS.level[interest]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((influence) => (
              <tr key={influence}>
                <th className="p-2 text-left text-xs font-medium text-ink-soft">{LABELS.level[influence]}</th>
                {COLS.map((interest) => {
                  const label = QUADRANT[`${influence}-${interest}`];
                  const people = stakeholders.filter((s) => s.influence === influence && s.interest === interest);
                  return (
                    <td key={interest} role="region" aria-label={label ?? `Influencia ${LABELS.level[influence]}, interés ${LABELS.level[interest]}`} className="h-20 border border-line p-2 align-top">
                      {label && <p className="mb-1 text-xs font-semibold text-ink-soft">{label}</p>}
                      <ul className="space-y-0.5 text-ink">
                        {people.map((s) => (
                          <li key={s.id}>{s.name}</li>
                        ))}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
