import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl, resolvePort } from '../src/config';

describe('resolvePort', () => {
  it('usa el puerto 3080 por defecto', () => {
    expect(resolvePort({})).toBe(3080);
  });
  it('respeta la variable PORT', () => {
    expect(resolvePort({ PORT: '4100' })).toBe(4100);
  });
});

describe('resolveDatabaseUrl', () => {
  it('usa DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://pm:pm@localhost:5433/pm_dev' })).toBe('postgresql://pm:pm@localhost:5433/pm_dev');
  });
  it('lanza un error si falta DATABASE_URL', () => {
    expect(() => resolveDatabaseUrl({})).toThrow('Falta DATABASE_URL');
  });
});
