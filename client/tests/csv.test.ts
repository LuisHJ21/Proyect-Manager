import { describe, expect, it } from 'vitest';
import { csvFilename, csvMoney, toCsv, type CsvColumn } from '../src/lib/csv';

type Row = { name: string; cost?: number | null; note: string };
const columns: CsvColumn<Row>[] = [
  { header: 'Nombre', value: (r: Row) => r.name },
  { header: 'Costo', value: (r: Row) => csvMoney(r.cost), onlyIfPresent: 'cost' },
  { header: 'Nota', value: (r: Row) => r.note },
];

describe('CSV', () => {
  it('lleva BOM, punto y coma y escapa comillas, punto y coma y saltos de línea', () => {
    const csv = toCsv(columns, [{ name: 'Obra; fase 1', cost: 123450, note: 'Dijo "sí"\nluego no' }]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual(['Nombre;Costo;Nota', '"Obra; fase 1";1234,50;"Dijo ""sí""\nluego no"']);
  });

  it('quita la columna de dinero si ninguna fila la trae', () => {
    const csv = toCsv<Row>(columns, [{ name: 'A', note: '' }]);
    expect(csv.slice(1).split('\r\n')[0]).toBe('Nombre;Nota');
  });

  it('nombre del archivo sin tildes ni espacios', () => {
    expect(csvFilename('Portal Público', 'riesgos')).toMatch(/^portal-publico-riesgos-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('CSV sin fórmulas', () => {
  it('un texto que empieza con = + - @ no se interpreta como fórmula', () => {
    const rows = [{ name: '=HYPERLINK("http://x","Ver")', note: '+1', cost: -5000 }, { name: '@SUMA', note: '-baja', cost: null }];
    const lines = toCsv(columns, rows).slice(1).split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""http://x"",""Ver"")";-50,00;'+1`);
    expect(lines[2]).toBe("'@SUMA;;'-baja");
  });
});
