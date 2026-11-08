import type { Tone } from '../components/ui';

/** Color de CPI y SPI: verde desde 1, ámbar desde 0,9 y rojo por debajo. */
export function indexTone(value: number | null): Extract<Tone, 'success' | 'warning' | 'danger'> | null {
  if (value === null) return null;
  if (value >= 1) return 'success';
  if (value >= 0.9) return 'warning';
  return 'danger';
}

export const cpiLabel = (value: number | null) => (value === null ? null : value < 1 ? 'Sobre el costo' : value === 1 ? 'En costo' : 'Bajo el costo');
export const spiLabel = (value: number | null) => (value === null ? null : value < 1 ? 'Atrasado' : value === 1 ? 'En plazo' : 'Adelantado');

export const formatIndex = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
