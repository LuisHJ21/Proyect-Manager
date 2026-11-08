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
  await expect(pm.getByText(email)).toBeVisible();
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
  await expect(pm.getByRole('main').getByRole('link', { name: title })).toBeVisible();
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
  await expect(pm.getByRole('heading', { name: /Paula/ })).toBeVisible();
  await expect(pm.getByText(/Crea tu primer proyecto/)).toBeVisible();
  // El Project Manager no tiene tareas propias.
  await expect(pm.getByRole('link', { name: /^Mis tareas/ })).toHaveCount(0);

  await pm.getByRole('link', { name: 'Usuarios' }).click();
  await createUser(pm, 'Beatriz', 'beatriz@x.com');
  await createUser(pm, 'Carlos', 'carlos@x.com');

  await pm.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await pm.getByLabel('Nombre').fill('Portal');
  await pm.getByLabel('Presupuesto planificado').fill('10.000,50');
  await pm.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(pm.getByRole('heading', { level: 1, name: 'Portal' })).toBeVisible();
  await addMember(pm, 'Beatriz', 'Diseño');
  await addMember(pm, 'Carlos', 'Desarrollo');
  const projectUrl = pm.url().replace(/\/resumen$/, '');

  await pm.getByRole('link', { name: 'Acta' }).click();
  await pm.getByRole('textbox', { name: 'Justificación' }).click();
  await pm.keyboard.type('Modernizar el sitio');
  // El alcance se escribe como lista con la barra de formato.
  await pm.getByRole('textbox', { name: 'Alcance incluido' }).click();
  await pm.getByRole('toolbar', { name: 'Formato de Alcance incluido' }).getByRole('button', { name: 'Lista con viñetas' }).click();
  await pm.keyboard.type('Sitio público');
  await pm.keyboard.press('Enter');
  await pm.keyboard.type('Blog');
  await pm.getByRole('textbox', { name: 'Criterios de éxito' }).fill('Lanzado en marzo');
  await pm.getByRole('button', { name: 'Aprobar acta' }).click();
  await expect(pm.getByText(/Aprobada por Paula/)).toBeVisible();
  await pm.reload();
  await expect(pm.getByRole('textbox', { name: 'Alcance incluido' }).locator('li')).toHaveCount(2);

  // Matriz RACI: una actividad con un responsable que aprueba y otro que la hace.
  await pm.getByRole('link', { name: 'Interesados' }).click();
  await pm.getByRole('button', { name: 'Añadir actividad' }).click();
  await pm.getByRole('dialog').getByLabel('Actividad').fill('Aprobar diseño');
  await pm.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(pm.getByText('Falta A')).toBeVisible();
  await pm.getByLabel('Aprobar diseño — Beatriz').selectOption('A');
  await pm.getByLabel('Aprobar diseño — Carlos').selectOption('R');
  await expect(pm.getByText('Completa')).toBeVisible();

  // 2. Crea dos tareas dependientes, cada una asignada a una persona.
  await pm.getByRole('link', { name: 'Tareas', exact: true }).click();
  await createTask(pm, 'Diseño', 'Beatriz');
  await createTask(pm, 'Construcción', 'Carlos');
  await pm.getByRole('link', { name: 'Construcción' }).click();
  await pm.getByLabel('Añadir predecesora').selectOption({ label: 'Diseño' });
  await pm.getByRole('button', { name: 'Añadir dependencia' }).click();
  await expect(pm.getByText('En espera de: Diseño')).toBeVisible();

  // El calendario muestra una tarea en su fecha límite.
  await pm.getByRole('link', { name: 'Tareas del proyecto' }).click();
  await pm.getByRole('link', { name: 'Diseño' }).click();
  await pm.getByRole('button', { name: 'Editar tarea' }).click();
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await pm.getByRole('dialog').getByLabel('Fecha límite').fill(todayText);
  await pm.getByRole('dialog').getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(pm.getByRole('dialog')).toHaveCount(0);
  await pm.getByRole('link', { name: 'Calendario' }).click();
  await expect(pm.getByTestId(`day-${todayText}`).getByRole('link', { name: 'Diseño' })).toBeVisible();

  // Línea base y valor ganado: costos planeados, línea base, un gasto ligado y un cambio aprobado.
  const later = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10);
  const laterText = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}`;
  const planTask = async (title: string, cost: string, due: string) => {
    await pm.goto(`${projectUrl}/tareas`);
    await pm.getByRole('main').getByRole('link', { name: title }).click();
    await pm.getByRole('button', { name: 'Editar tarea' }).click();
    const dialog = pm.getByRole('dialog');
    await dialog.getByLabel('Fecha de inicio').fill(todayText);
    await dialog.getByLabel('Fecha límite').fill(due);
    await dialog.getByLabel('Costo planeado').fill(cost);
    await dialog.getByRole('button', { name: 'Guardar tarea' }).click();
    await expect(pm.getByRole('dialog')).toHaveCount(0);
  };
  await planTask('Diseño', '1.000', todayText);
  await planTask('Construcción', '3.000', laterText);
  await pm.goto(`${projectUrl}/desempeno`);
  await expect(pm.getByText('2 tareas con costo planeado.')).toBeVisible();
  await pm.getByRole('button', { name: 'Fijar línea base' }).click();
  await expect(pm.getByText('Versión 1').first()).toBeVisible();

  await pm.getByRole('link', { name: 'Presupuesto' }).click();
  await pm.getByRole('button', { name: 'Añadir gasto' }).click();
  const expenseDialog = pm.getByRole('dialog');
  await expenseDialog.getByLabel('Descripción').fill('Bocetos');
  await expenseDialog.getByLabel('Monto').fill('500');
  await expenseDialog.getByLabel('Fecha').fill(todayText);
  await expenseDialog.getByLabel('Tarea (opcional)').selectOption({ label: 'Diseño' });
  await expenseDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(pm.getByRole('dialog')).toHaveCount(0);

  await pm.getByRole('link', { name: 'Desempeño' }).click();
  const cpiCard = pm.getByRole('region', { name: 'Indicadores de valor ganado' }).locator('[data-card]').filter({ hasText: 'CPI' });
  await expect(cpiCard).toContainText('Sobre el costo');

  await pm.getByRole('link', { name: 'Cambios' }).click();
  await pm.getByRole('button', { name: 'Añadir cambio' }).click();
  const changeDialog = pm.getByRole('dialog');
  await changeDialog.getByLabel('Título').fill('Agregar blog');
  await changeDialog.getByLabel('Impacto en plazo (días)').fill('5');
  await changeDialog.getByLabel('Impacto en costo').fill('800');
  await changeDialog.getByRole('button', { name: 'Guardar' }).click();
  await pm.getByRole('button', { name: 'Aprobar CR-1' }).click();
  await pm.getByRole('dialog').getByLabel('Nota de la decisión').fill('Lo pide la dirección');
  await pm.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(pm.getByRole('main').getByText('Aprobada')).toBeVisible();

  await pm.getByRole('link', { name: 'Desempeño' }).click();
  await pm.getByRole('button', { name: 'Fijar nueva línea base' }).click();
  const baselineDialog = pm.getByRole('dialog');
  await baselineDialog.getByLabel('Motivo').fill('Cambio aprobado');
  await baselineDialog.getByLabel('Cambio aprobado (opcional)').selectOption({ label: 'CR-1 · Agregar blog' });
  await baselineDialog.getByRole('button', { name: 'Fijar' }).click();
  await expect(pm.getByRole('dialog')).toHaveCount(0);
  await expect(pm.getByText('Versión 2').first()).toBeVisible();
  await expect(pm.getByText('Cambio: CR-1 · Agregar blog').first()).toBeVisible();

  // Pasos: el Project Manager añade dos a la tarea de Carlos.
  await pm.goto(`${projectUrl}/tareas`);
  await pm.getByRole('main').getByRole('link', { name: 'Construcción' }).click();
  for (const step of ['Base', 'Pantallas']) {
    await pm.getByLabel('Nuevo paso', { exact: true }).fill(step);
    await pm.getByRole('button', { name: 'Añadir paso' }).click();
    await expect(pm.getByRole('checkbox', { name: step })).toBeVisible();
  }

  // 3. Carlos entra e intenta iniciar su tarea: la app lo bloquea e indica qué falta.
  const carlos = await signInFirstTime(browser, 'carlos@x.com');
  await carlos.getByRole('link', { name: 'Construcción' }).click();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('alert')).toContainText('Antes deben terminar: Diseño');

  // 4. Carlos no ve las secciones del PM, ni entrando por la dirección.
  await carlos.goto(`${projectUrl}/resumen`);
  await expect(carlos.getByTestId('indicator-progress')).toBeVisible();
  const tabs = carlos.getByRole('navigation', { name: 'Secciones del proyecto' });
  await expect(tabs.getByRole('link', { name: 'Riesgos' })).toHaveCount(0);
  await expect(tabs.getByRole('link', { name: 'Presupuesto' })).toHaveCount(0);
  await carlos.goto(`${projectUrl}/acta`);
  await expect(carlos.getByRole('listitem').filter({ hasText: 'Blog' })).toBeVisible();
  await carlos.goto(`${projectUrl}/presupuesto`);
  await expect(carlos).toHaveURL(/\/resumen$/);
  await expect(carlos.getByText('Presupuesto planificado')).toHaveCount(0);

  // 5. Beatriz termina su tarea y adjunta un PDF.
  const beatriz = await signInFirstTime(browser, 'beatriz@x.com');
  await beatriz.getByRole('link', { name: 'Diseño' }).click();
  await beatriz.getByLabel('Estado').selectOption({ label: 'Hecha' });
  await beatriz.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(beatriz.getByText('100 %')).toBeVisible();
  await beatriz.getByLabel('Adjuntar archivo').setInputFiles({
    name: 'diseño final.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-prueba'),
  });
  await expect(beatriz.getByRole('link', { name: 'diseño final.pdf' })).toBeVisible();

  // 6. Carlos ya puede iniciar su tarea y descarga el anexo de Diseño.
  await carlos.goto(`${projectUrl}/tareas`);
  await carlos.getByRole('link', { name: 'Construcción' }).click();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('main').getByText('En curso', { exact: true }).first()).toBeVisible();
  await expect(carlos.getByRole('alert')).toHaveCount(0);

  // No puede terminarla con pasos pendientes; al completarlos, sí.
  await carlos.getByLabel('Estado').selectOption({ label: 'Hecha' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('alert')).toContainText('Faltan 2 pasos');
  await carlos.getByRole('checkbox', { name: 'Base' }).click();
  await expect(carlos.getByText('1 de 2 completados')).toBeVisible();
  await expect(carlos.getByText('Avance: 50 %')).toBeVisible();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });

  await carlos.getByRole('link', { name: 'Tareas del proyecto' }).click();
  await carlos.getByRole('link', { name: 'Diseño' }).click();
  const downloadPromise = carlos.waitForEvent('download');
  await carlos.getByRole('link', { name: 'diseño final.pdf' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('diseño final.pdf');

  // 7. El PM ve el avance actualizado.
  await pm.goto(`${projectUrl}/resumen`);
  await expect(pm.getByTestId('indicator-progress')).toHaveText('75 %');

  // El panel refleja el proyecto.
  await pm.getByRole('link', { name: 'Inicio' }).click();
  await expect(pm.getByTestId('kpi-activeProjects')).toContainText('1');
  await expect(pm.getByRole('main').getByRole('link', { name: 'Portal' })).toBeVisible();
});
