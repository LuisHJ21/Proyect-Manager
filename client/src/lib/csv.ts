import { localToday, toPlainText } from '@pm/shared';

export type CsvValue = string | number | null | undefined;
export type CsvColumn<T> = {
  header: string;
  value: (row: T) => CsvValue;
  /** Solo se incluye si alguna fila trae esta clave (p. ej. montos que la API envía solo al PM). */
  onlyIfPresent?: keyof T & string;
};

const SEPARATOR = ';';
/** Excel en español abre bien un CSV con punto y coma y BOM UTF-8. */
const BOM = '﻿';

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con las columnas visibles; las condicionadas se quitan si ninguna fila trae su clave. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const visible = columns.filter((c) => !c.onlyIfPresent || rows.some((r) => (r as Record<string, unknown>)[c.onlyIfPresent!] !== undefined));
  const lines = [visible.map((c) => cell(c.header)), ...rows.map((r) => visible.map((c) => cell(c.value(r))))];
  return BOM + lines.map((l) => l.join(SEPARATOR)).join('\r\n');
}

/** Centavos como número decimal con coma, sin símbolo: «1234,50». */
export const csvMoney = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));
export const csvText = (html: string | null | undefined) => (html ? toPlainText(html) : '');

/** Descarga el CSV en el navegador. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** «portal-riesgos-2026-11-17.csv» */
export const csvFilename = (projectName: string, list: string) =>
  `${projectName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'proyecto'}-${list}-${localToday(new Date())}.csv`;
