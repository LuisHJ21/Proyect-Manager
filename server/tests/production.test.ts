import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProductionApp, createProductionDeps } from '../src/production';
import { SupabaseFileStore } from '../src/storage/supabaseFileStore';

const complete = {
  DATABASE_URL: 'postgresql://pm:pm@localhost:5433/pm_dev',
  DIRECT_URL: 'postgresql://pm:pm@localhost:5433/pm_dev',
  SUPABASE_URL: 'https://ejemplo.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'clave-de-prueba',
  SETUP_TOKEN: 'codigo',
};

describe('configuración de producción', () => {
  afterEach(() => vi.useRealTimers());

  it('sin variables pide DATABASE_URL', () => {
    expect(() => createProductionApp({})).toThrow(/DATABASE_URL/);
  });

  it('con todo menos SETUP_TOKEN pide SETUP_TOKEN', () => {
    const { SETUP_TOKEN: _, ...rest } = complete;
    expect(() => createProductionApp(rest)).toThrow('Falta la variable SETUP_TOKEN');
  });

  it.each(['DIRECT_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('una variable vacía cuenta como ausente: %s', (name) => {
    expect(() => createProductionDeps({ ...complete, [name]: '' })).toThrow(`Falta la variable ${name}`);
  });

  it('usa Supabase Storage, cookie Secure, el código y la zona de Lima por omisión', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 3:00 UTC del 7 son las 22:00 del 6 en Lima.
    vi.setSystemTime(new Date('2026-11-07T03:00:00Z'));
    const deps = createProductionDeps(complete);
    expect(deps.files).toBeInstanceOf(SupabaseFileStore);
    expect(deps.secureCookies).toBe(true);
    expect(deps.setupToken).toBe('codigo');
    expect(deps.today()).toBe('2026-11-06');
  });

  it('respeta APP_TIMEZONE', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-07T03:00:00Z'));
    expect(createProductionDeps({ ...complete, APP_TIMEZONE: 'UTC' }).today()).toBe('2026-11-07');
  });

  it('comparte un solo PrismaClient', () => {
    expect(createProductionDeps(complete).prisma).toBe(createProductionDeps(complete).prisma);
  });

  it('la aplicación responde con cabeceras de seguridad sin tocar la base', async () => {
    const res = await createProductionApp(complete).request('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
