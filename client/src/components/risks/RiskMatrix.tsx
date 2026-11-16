import { toPlainText } from '@pm/shared';
import { useState } from 'react';
import type { Risk } from '../../api/types';
import { Card, inputClass } from '../ui';

const SCALE = [1, 2, 3, 4, 5];
const short = (html: string) => {
  const text = toPlainText(html);
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
};

/** Color de la celda según su puntaje y el umbral de riesgo alto del proyecto. */
const cellTone = (score: number, high: number) => (score >= high ? 'bg-risk-bg' : score >= 8 ? 'bg-warn-bg' : 'bg-ok-bg');

/** Matriz 5×5 de probabilidad por impacto con los riesgos abiertos, inicial o residual. */
export function RiskMatrix({ risks, highRiskScore = 15 }: { risks: Risk[]; highRiskScore?: number }) {
  const [mode, setMode] = useState<'initial' | 'residual'>('initial');
  const open = risks.filter((r) => r.status !== 'CLOSED');
  const position = (r: Risk) =>
    mode === 'initial' ? { p: r.probability, i: r.impact } : r.residualProbability && r.residualImpact ? { p: r.residualProbability, i: r.residualImpact } : null;
  const withoutResidual = mode === 'residual' ? open.filter((r) => position(r) === null).length : 0;
  return (
    <div role="region" aria-label="Matriz de riesgos">
      <Card
        title="Matriz de riesgos"
        actions={
          <label className="flex items-center gap-2 text-sm text-ink-nav">
            Mostrar
            <select aria-label="Mostrar" className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as 'initial' | 'residual')}>
              <option value="initial">Inicial</option>
              <option value="residual">Residual</option>
            </select>
          </label>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-24 p-1 text-left font-medium text-ink-soft">Prob. \ Impacto</th>
                {SCALE.map((i) => (
                  <th key={i} className="p-1 font-medium text-ink-soft">
                    {i}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...SCALE].reverse().map((p) => (
                <tr key={p}>
                  <th className="p-1 text-left font-medium text-ink-soft">{p}</th>
                  {SCALE.map((i) => {
                    const here = open.filter((r) => {
                      const pos = position(r);
                      return pos?.p === p && pos.i === i;
                    });
                    return (
                      <td key={i} aria-label={`Probabilidad ${p}, impacto ${i}`} className={`h-16 border border-line p-1 align-top ${cellTone(p * i, highRiskScore)}`}>
                        <ul className="space-y-0.5 text-ink">
                          {here.map((r) => (
                            <li key={r.id}>{short(r.description)}</li>
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
        {withoutResidual > 0 && <p className="mt-2 text-xs text-ink-soft">{`${withoutResidual} riesgos sin evaluación residual`}</p>}
      </Card>
    </div>
  );
}
