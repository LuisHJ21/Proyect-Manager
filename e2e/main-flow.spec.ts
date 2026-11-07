import { expect, test, type Browser, type Page } from '@playwright/test';

const FIRST_PASSWORD = 'contraseña-del-pm-1';
const TEMP_PASSWORD = 'temporal-12345';
const NEW_PASSWORD = 'mi-clave-definitiva';

async function createUser(pm: Page, name: string, email: string) {
  await pm.getByRole('button', { name: 'Nuevo usuario' }).click();
  await pm.getByLabel('Nombre').fill(name);
  await pm.getByLabel('Correo').fill(email);
  await pm.getByLabel('Contraseña temporal').fill(TEMP_PASSWORD);
  await pm.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(pm.getByRole('cell', { name: email })).toBeVisible();
}

async function addMember(pm: Page, name: string, role: string) {
  await pm.getByLabel('Añadir persona').selectOption({ label: name });
  await pm.getByLabel('Rol en el proyecto').fill(role);
  await pm.getByRole('button', { name: 'Añadir al equipo' }).click();
  await expect(pm.getByRole('button', { name: `Quitar a ${name}` })).toBeVisible();
}

async function createTask(pm: Page, title: string, assignee: string) {
  await pm.getByRole('button', { name: 'Nueva tarea' }).click();
  const dialog = pm.getByRole('dialog');
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel(assignee).check();
  await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(pm.getByRole('button', { name: title })).toBeVisible();
}

/** Abre una sesión nueva y cambia la contraseña temporal. */
async function signInFirstTime(browser: Browser, email: string) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(TEMP_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Contraseña actual').fill(TEMP_PASSWORD);
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Mis tareas' })).toBeVisible();
  return page;
}

test('flujo principal', async ({ browser }) => {
  // 1. El PM hace la configuración inicial, crea usuarios y un proyecto con su acta aprobada.
  const pm = await (await browser.newContext()).newPage();
  await pm.goto('/');
  await pm.getByLabel('Nombre').fill('Paula');
  await pm.getByLabel('Correo').fill('paula@x.com');
  await pm.getByLabel('Contraseña').fill(FIRST_PASSWORD);
  await pm.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(pm.getByRole('heading', { name: 'Proyectos' })).toBeVisible();

  await pm.getByRole('link', { name: 'Usuarios' }).click();
  await createUser(pm, 'Beatriz', 'beatriz@x.com');
  await createUser(pm, 'Carlos', 'carlos@x.com');

  await pm.getByRole('link', { name: 'Proyectos' }).click();
  await pm.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await pm.getByLabel('Nombre').fill('Portal');
  await pm.getByLabel('Presupuesto planificado').fill('10.000,50');
  await pm.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pm.getByRole('heading', { name: 'Portal' })).toBeVisible();
  await addMember(pm, 'Beatriz', 'Diseño');
  await addMember(pm, 'Carlos', 'Desarrollo');
  const projectUrl = pm.url().replace(/\/resumen$/, '');

  await pm.getByRole('link', { name: 'Acta' }).click();
  await pm.getByLabel('Justificación').fill('Modernizar el sitio');
  await pm.getByLabel('Alcance incluido').fill('Sitio público');
  await pm.getByLabel('Criterios de éxito').fill('Lanzado en marzo');
  await pm.getByRole('button', { name: 'Aprobar acta' }).click();
  await expect(pm.getByText(/Aprobada por Paula/)).toBeVisible();

  // 2. Crea dos tareas dependientes, cada una asignada a una persona.
  await pm.getByRole('link', { name: 'Tareas', exact: true }).click();
  await createTask(pm, 'Diseño', 'Beatriz');
  await createTask(pm, 'Construcción', 'Carlos');
  await pm.getByRole('button', { name: 'Construcción' }).click();
  await pm.getByLabel('Añadir predecesora').selectOption({ label: 'Diseño' });
  await pm.getByRole('button', { name: 'Añadir dependencia' }).click();
  await expect(pm.getByRole('dialog').getByText('En espera de: Diseño')).toBeVisible();
  await pm.getByRole('button', { name: 'Cerrar', exact: true }).click();

  // 3. Carlos entra e intenta iniciar su tarea: la app lo bloquea e indica qué falta.
  const carlos = await signInFirstTime(browser, 'carlos@x.com');
  await carlos.getByRole('button', { name: 'Construcción' }).click();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('alert')).toContainText('Antes deben terminar: Diseño');
  await carlos.getByRole('button', { name: 'Cerrar', exact: true }).click();

  // 4. Carlos no ve las secciones del PM, ni entrando por la dirección.
  await carlos.goto(`${projectUrl}/resumen`);
  await expect(carlos.getByTestId('indicator-progress')).toBeVisible();
  const tabs = carlos.getByRole('navigation', { name: 'Secciones del proyecto' });
  await expect(tabs.getByRole('link', { name: 'Riesgos' })).toHaveCount(0);
  await expect(tabs.getByRole('link', { name: 'Presupuesto' })).toHaveCount(0);
  await carlos.goto(`${projectUrl}/presupuesto`);
  await expect(carlos).toHaveURL(/\/resumen$/);
  await expect(carlos.getByText('Presupuesto planificado')).toHaveCount(0);

  // 5. Beatriz termina su tarea y adjunta un PDF.
  const beatriz = await signInFirstTime(browser, 'beatriz@x.com');
  await beatriz.getByRole('button', { name: 'Diseño' }).click();
  await beatriz.getByLabel('Estado').selectOption({ label: 'Hecha' });
  await beatriz.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(beatriz.getByRole('dialog').getByText('100 %')).toBeVisible();
  await beatriz.getByLabel('Adjuntar archivo').setInputFiles({
    name: 'diseño final.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-prueba'),
  });
  await expect(beatriz.getByRole('link', { name: 'diseño final.pdf' })).toBeVisible();

  // 6. Carlos ya puede iniciar su tarea y descarga el anexo de Diseño.
  await carlos.goto(`${projectUrl}/tareas`);
  await carlos.getByRole('button', { name: 'Construcción' }).click();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('dialog').getByText('En curso', { exact: true }).first()).toBeVisible();
  await expect(carlos.getByRole('alert')).toHaveCount(0);
  await carlos.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await carlos.getByRole('button', { name: 'Diseño' }).click();
  const downloadPromise = carlos.waitForEvent('download');
  await carlos.getByRole('link', { name: 'diseño final.pdf' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('diseño final.pdf');

  // 7. El PM ve el avance actualizado.
  await pm.goto(`${projectUrl}/resumen`);
  await expect(pm.getByTestId('indicator-progress')).toHaveText('50 %');
});
