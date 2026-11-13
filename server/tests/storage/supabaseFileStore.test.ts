import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = {
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
};
const from = vi.fn(() => bucket);
const createClient = vi.fn((_url: string, _key: string, _opts?: unknown) => ({ storage: { from } }));

vi.mock('@supabase/supabase-js', () => ({ createClient }));

const { SupabaseFileStore } = await import('../../src/storage/supabaseFileStore');

describe('almacén en Supabase Storage', () => {
  let store: InstanceType<typeof SupabaseFileStore>;
  beforeEach(() => {
    vi.clearAllMocks();
    store = new SupabaseFileStore({ url: 'https://abc.supabase.co', serviceRoleKey: 'clave-servicio', bucket: 'anexos' });
  });

  it('usa la clave de servicio, sin sesión persistente, y el bucket indicado', async () => {
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await store.remove(['a']);
    expect(createClient).toHaveBeenCalledWith('https://abc.supabase.co', 'clave-servicio', expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }));
    expect(from).toHaveBeenCalledWith('anexos');
  });

  it('createUpload devuelve la dirección firmada con PUT y los encabezados de uploadToSignedUrl', async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: 'https://abc.supabase.co/firmada?token=t', token: 't', path: 's1' }, error: null });
    const target = await store.createUpload('s1', 'application/pdf');
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith('s1');
    expect(target).toEqual({
      url: 'https://abc.supabase.co/firmada?token=t',
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'cache-control': 'max-age=3600', 'x-upsert': 'false' },
    });
    expect(JSON.stringify(target)).not.toContain('clave-servicio');
  });

  it('download pide una dirección de 60 segundos como descarga con el nombre original', async () => {
    bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://abc.supabase.co/descarga' }, error: null });
    expect(await store.download('s1', 'informe ñ.pdf')).toEqual({ redirect: 'https://abc.supabase.co/descarga' });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('s1', 60, { download: 'informe ñ.pdf' });
  });

  it('stat devuelve el tamaño, o null cuando el objeto no existe', async () => {
    bucket.info.mockResolvedValueOnce({ data: { size: 1234 }, error: null });
    expect(await store.stat('s1')).toEqual({ size: 1234 });
    bucket.info.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Object not found'), { status: 404 }) });
    expect(await store.stat('no-existe')).toBeNull();
    bucket.info.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('Object not found'), { status: 400 }) });
    expect(await store.stat('no-existe')).toBeNull();
  });

  it('stat propaga otros errores', async () => {
    bucket.info.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('caído'), { status: 500 }) });
    await expect(store.stat('s1')).rejects.toThrow('caído');
  });

  it('remove borra los objetos y remove([]) no llama a la API', async () => {
    await store.remove([]);
    expect(bucket.remove).not.toHaveBeenCalled();
    bucket.remove.mockResolvedValue({ data: [], error: null });
    await store.remove(['a', 'b']);
    expect(bucket.remove).toHaveBeenCalledWith(['a', 'b']);
  });

  it('un error de la API se propaga', async () => {
    bucket.createSignedUploadUrl.mockResolvedValue({ data: null, error: new Error('sin permiso') });
    await expect(store.createUpload('s1', 'application/pdf')).rejects.toThrow('sin permiso');
  });
});
