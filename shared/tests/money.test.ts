import { describe, expect, it } from 'vitest';
import { formatMoney, parseMoneyToCents } from '../src/money';

describe('parseMoneyToCents', () => {
  it('interpreta formatos latino y anglosajón', () => {
    expect(parseMoneyToCents('1.234,50')).toBe(123450);
    expect(parseMoneyToCents('1,234.50')).toBe(123450);
    expect(parseMoneyToCents('1234.5')).toBe(123450);
    expect(parseMoneyToCents('1,5')).toBe(150);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('1.234.567,89')).toBe(123456789);
    expect(parseMoneyToCents(' 0.29 ')).toBe(29);
    expect(parseMoneyToCents('0')).toBe(0);
  });
  it('rechaza valores negativos o mal formados', () => {
    for (const bad of ['-5', 'abc', '', '1,2,3', '1.2345', '1,234,50', '1.', ',5']) {
      expect(parseMoneyToCents(bad), bad).toBeNull();
    }
  });
});

describe('formatMoney', () => {
  it('incluye el monto con dos decimales', () => {
    expect(formatMoney(123450, 'USD')).toMatch(/1.?234.50/);
  });
  it('no falla con un código de moneda inválido', () => {
    expect(formatMoney(100, '??')).toContain('1');
  });
});
