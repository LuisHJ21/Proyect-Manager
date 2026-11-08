import { describe, expect, it } from 'vitest';
import { cpiLabel, formatIndex, indexTone, spiLabel } from '../src/lib/evmDisplay';

describe('presentación del valor ganado', () => {
  it('indexTone', () => {
    expect(indexTone(1)).toBe('success');
    expect(indexTone(1.3)).toBe('success');
    expect(indexTone(0.9)).toBe('warning');
    expect(indexTone(0.89)).toBe('danger');
    expect(indexTone(null)).toBeNull();
  });
  it('cpiLabel', () => {
    expect(cpiLabel(0.8)).toBe('Sobre el costo');
    expect(cpiLabel(1)).toBe('En costo');
    expect(cpiLabel(1.1)).toBe('Bajo el costo');
    expect(cpiLabel(null)).toBeNull();
  });
  it('spiLabel', () => {
    expect(spiLabel(0.8)).toBe('Atrasado');
    expect(spiLabel(1)).toBe('En plazo');
    expect(spiLabel(1.2)).toBe('Adelantado');
    expect(spiLabel(null)).toBeNull();
  });
  it('formatIndex usa coma decimal y dos decimales', () => {
    expect(formatIndex(0.8)).toBe('0,80');
    expect(formatIndex(1.25)).toBe('1,25');
    expect(formatIndex(null)).toBe('—');
  });
});
