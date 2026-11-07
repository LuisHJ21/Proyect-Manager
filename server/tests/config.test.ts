import { describe, expect, it } from 'vitest';
import { resolvePort } from '../src/config';

describe('resolvePort', () => {
  it('usa el puerto 3080 por defecto', () => {
    expect(resolvePort({})).toBe(3080);
  });
  it('respeta la variable PORT', () => {
    expect(resolvePort({ PORT: '4100' })).toBe(4100);
  });
});
