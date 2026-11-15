import type { Project, User } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sanitizeRichText } from '../src/richText';
import { createTestApp, type TestCtx } from './helpers/testApp';

describe('sanitizeRichText', () => {
  it('conserva las etiquetas permitidas', () => {
    const html = '<h3>T</h3><p><strong>a</strong><em>b</em><br /></p><ul><li>x</li></ul><ol><li>y</li></ol>';
    expect(sanitizeRichText(html)).toBe(html);
  });
  it('elimina script, style, atributos, enlaces e imágenes', () => {
    expect(sanitizeRichText('<p onclick="x()" class="c">Hola<script>alert(1)</script><style>p{}</style></p>')).toBe('<p>Hola</p>');
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">ver</a><img src=x onerror=alert(1)></p>')).toBe('<p>ver</p>');
  });
  it('convierte el texto plano en párrafos escapados', () => {
    expect(sanitizeRichText('uno < dos\ntres')).toBe('<p>uno &lt; dos</p><p>tres</p>');
  });
  it('conserva el texto antiguo con algo parecido a una etiqueta', () => {
    expect(sanitizeRichText('Contacto: Juan <juan@empresa.com> & equipo')).toBe('<p>Contacto: Juan &lt;juan@empresa.com&gt; &amp; equipo</p>');
  });
  it.each(['Contacto: Juan <juan@empresa.com> & equipo', '<b>hola</b>', '<p>a<br>b</p>', ['uno', 'dos'].join('\n'),'<ul><li>x</li></ul>', '<div>a</div><p>b</p>'])(
    'limpiar dos veces da lo mismo que una: %j',
    (input) => {
      const once = sanitizeRichText(input);
      expect(sanitizeRichText(once)).toBe(once);
    },
  );
  it.each(['<p></p>', '<p> </p>', '<p><br></p>', '   '])('guarda %j como vacío', (input) => {
    expect(sanitizeRichText(input)).toBe('');
  });
});

describe('API con texto con formato', () => {
  let ctx: TestCtx;
  let pm: User;
  let project: Project;
  const charterUrl = () => `/api/projects/${project.id}/charter`;
  const risk = { type: 'THREAT', probability: 4, impact: 5, response: 'MITIGATE' };
  beforeEach(async () => {
    ctx = await createTestApp();
    pm = await ctx.makeUser({ role: 'PM' });
    project = await ctx.makeProject();
  });
  afterEach(() => ctx.close());

  it('guarda el acta ya limpia y deja el patrocinador como texto simple', async () => {
    const res = await ctx.as(pm).put(charterUrl(), { justification: '<p>Hola<script>x</script></p>', sponsor: '<b>Ana</b>', version: 1 });
    expect(res.json()).toMatchObject({ justification: '<p>Hola</p>', sponsor: '<b>Ana</b>' });
    const stored = await ctx.prisma.charter.findUniqueOrThrow({ where: { projectId: project.id } });
    expect(stored.justification).toBe('<p>Hola</p>');
  });

  it('no aprueba campos con formato vacíos', async () => {
    await ctx.as(pm).put(charterUrl(), { justification: '<p><br></p>', scopeIncluded: '<p> </p>', successCriteria: '<p>Ok</p>', version: 1 });
    const res = await ctx.as(pm).post(`${charterUrl()}/approve`, { version: 2 });
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().error.fields).sort()).toEqual(['justification', 'scopeIncluded']);
  });

  it('guardar sin cambios reales no reabre el acta', async () => {
    const complete = { justification: '<p>Uno</p>', scopeIncluded: '<p>A</p>', successCriteria: '<p>C</p>' };
    await ctx.as(pm).put(charterUrl(), { ...complete, version: 1 });
    await ctx.as(pm).post(`${charterUrl()}/approve`, { version: 2 });
    const res = await ctx.as(pm).put(charterUrl(), { ...complete, justification: '<p>Uno</p><script></script>', version: 3 });
    expect(res.json().status).toBe('APPROVED');
  });

  it('guardar el mismo texto antiguo convertido a HTML no reabre el acta', async () => {
    await ctx.prisma.charter.update({
      where: { projectId: project.id },
      data: { justification: 'Uno\nDos', scopeIncluded: 'A', successCriteria: 'C', status: 'APPROVED', approvedById: pm.id, approvedAt: new Date() },
    });
    const res = await ctx.as(pm).put(charterUrl(), { justification: '<p>Uno</p><p>Dos</p>', scopeIncluded: '<p>A</p>', successCriteria: '<p>C</p>', version: 1 });
    expect(res.json().status).toBe('APPROVED');
  });

  it('objetivos y riesgos con descripción vacía con formato responden 400', async () => {
    const objective = await ctx.as(pm).post(`/api/projects/${project.id}/objectives`, { description: '<p></p>' });
    expect(objective.statusCode).toBe(400);
    expect(objective.json().error.fields.description).toBeTruthy();
    const created = await ctx.as(pm).post(`/api/projects/${project.id}/risks`, { ...risk, description: '<p><br></p>' });
    expect(created.statusCode).toBe(400);
    expect(created.json().error.fields.description).toBeTruthy();
    const ok = await ctx.as(pm).post(`/api/projects/${project.id}/risks`, { ...risk, description: '<p>Retraso</p>' });
    const patched = await ctx.as(pm).patch(`/api/projects/${project.id}/risks/${ok.json().id}`, { description: '<p> </p>', version: 1 });
    expect(patched.statusCode).toBe(400);
  });

  it('objetivos y riesgos se guardan limpios', async () => {
    const res = await ctx.as(pm).post(`/api/projects/${project.id}/risks`, {
      ...risk,
      description: '<p>Retraso<img src=x></p>',
      responsePlan: '<ul><li onclick="x">a</li></ul>',
    });
    expect(res.json()).toMatchObject({ description: '<p>Retraso</p>', responsePlan: '<ul><li>a</li></ul>' });
    const objective = await ctx.as(pm).post(`/api/projects/${project.id}/objectives`, { description: 'Lanzar' });
    expect(objective.json().description).toBe('<p>Lanzar</p>');
  });

  it('la descripción del proyecto se guarda limpia al crear y al editar', async () => {
    const created = await ctx.as(pm).post('/api/projects', { name: 'Portal', description: '<p>Sitio<script>x</script></p>' });
    expect(created.json().description).toBe('<p>Sitio</p>');
    const patched = await ctx.as(pm).patch(`/api/projects/${created.json().id}`, { description: '<h3 style="x">Nuevo</h3>' });
    expect(patched.json().description).toBe('<h3>Nuevo</h3>');
  });

  it('el título de un riesgo en Requiere atención es texto plano', async () => {
    await ctx.as(pm).post(`/api/projects/${project.id}/risks`, { ...risk, description: '<p><strong>Caída</strong> del servidor</p>' });
    const body = (await ctx.as(pm).get('/api/dashboard')).json();
    expect(body.attention.find((item: { kind: string }) => item.kind === 'risk').title).toBe('Caída del servidor');
  });
});
