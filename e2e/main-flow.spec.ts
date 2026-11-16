import { expect, test, type Browser, type Page } from '@playwright/test';

const FIRST_PASSWORD = 'contraseña-del-pm-1';
const TEMP_PASSWORD = 'temporal-12345';
const NEW_PASSWORD = 'mi-clave-definitiva';

async function createUser(pm: Page, name: string, email: string, role?: string) {
  await pm.getByRole('button', { name: 'Nuevo usuario' }).click();
  await pm.getByLabel('Nombre').fill(name);
  await pm.getByLabel('Correo').fill(email);
  if (role) await pm.getByRole('dialog').getByLabel('Rol').selectOption({ label: role });
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
async function signInFirstTime(browser: Browser, email: string, heading = 'Mis tareas') {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña').fill(TEMP_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.getByLabel('Contraseña actual').fill(TEMP_PASSWORD);
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
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
  // El Project Manager también ejecuta tareas: tiene su página Mis tareas.
  await expect(pm.getByRole('link', { name: 'Mis tareas, 0 abiertas' })).toBeVisible();

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

  // EDT: una subtarea bajo una tarea sin trabajo propio recibe su código.
  await pm.getByRole('button', { name: 'Nueva tarea' }).click();
  await pm.getByRole('dialog').getByLabel('Título').fill('Entrega');
  await pm.getByRole('dialog').getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(pm.getByRole('main').getByRole('link', { name: 'Entrega', exact: true })).toBeVisible();
  await pm.getByRole('button', { name: 'Nueva tarea' }).click();
  await pm.getByRole('dialog').getByLabel('Título').fill('Documentación');
  await pm.getByRole('dialog').getByLabel('Tarea padre').selectOption({ label: '3 Entrega' });
  await pm.getByRole('dialog').getByRole('button', { name: 'Guardar tarea' }).click();
  await expect(pm.getByRole('row').filter({ hasText: 'Documentación' })).toContainText('3.1');
  // Se retiran para no alterar el avance ni los costos del resto del flujo; la padre no se borra antes que su subtarea.
  for (const title of ['Documentación', 'Entrega']) {
    await pm.getByRole('main').getByRole('link', { name: title, exact: true }).click();
    await pm.getByRole('button', { name: 'Eliminar tarea' }).click();
    await pm.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
    await expect(pm.getByRole('main').getByRole('link', { name: 'Construcción' })).toBeVisible();
  }
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
    await pm.getByRole('main').getByRole('link', { name: title, exact: true }).click();
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

  await pm.getByRole('link', { name: 'Control de cambios' }).click();
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
  // F2: la campana le avisa de la tarea que le asignó el PM y lo lleva a ella.
  await carlos.getByRole('button', { name: /^Avisos, \d+ sin leer$/ }).click();
  await carlos.getByRole('button', { name: /Te asignaron la tarea «Construcción»/ }).click();
  await expect(carlos).toHaveURL(/\/tareas\/[^/]+$/);
  await carlos.goBack();
  await carlos.getByRole('link', { name: 'Construcción' }).click();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });
  await carlos.getByRole('button', { name: 'Guardar avance' }).click();
  await expect(carlos.getByRole('alert')).toContainText('Antes deben terminar: Diseño');

  // 4. Carlos no ve las secciones del PM, ni entrando por la dirección.
  await carlos.goto(`${projectUrl}/resumen`);
  await expect(carlos.getByTestId('indicator-progress')).toBeVisible();
  const tabs = carlos.getByRole('navigation', { name: 'Secciones del proyecto' });
  // C1: el colaborador ve Riesgos (solo los suyos) y Entregables.
  await expect(tabs.getByRole('link', { name: 'Riesgos' })).toBeVisible();
  await expect(tabs.getByRole('link', { name: 'Presupuesto' })).toHaveCount(0);
  await carlos.goto(`${projectUrl}/acta`);
  await expect(carlos.getByRole('listitem').filter({ hasText: 'Blog' })).toBeVisible();
  await carlos.goto(`${projectUrl}/presupuesto`);
  await expect(carlos).toHaveURL(/\/resumen$/);
  await expect(carlos.getByText('Presupuesto planificado')).toHaveCount(0);

  // F4: Carlos propone un cambio; el PM recibe el aviso, lo abre y lo aprueba.
  await carlos.goto(`${projectUrl}/cambios`);
  await carlos.getByRole('button', { name: 'Proponer cambio' }).click();
  const proposeDialog = carlos.getByRole('dialog');
  await proposeDialog.getByLabel('Título').fill('Agregar buscador');
  await proposeDialog.getByLabel('Descripción').fill('Para encontrar páginas');
  await proposeDialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(carlos.getByRole('listitem').filter({ hasText: 'Agregar buscador' })).toContainText('Pendiente');
  await pm.goto(`${projectUrl}/resumen`);
  await pm.getByRole('button', { name: /^Avisos, \d+ sin leer$/ }).click();
  await pm.getByRole('button', { name: /Carlos propuso el cambio «CR-\d+ Agregar buscador»/ }).click();
  await expect(pm).toHaveURL(/\/cambios$/);
  await expect(pm.getByText('Propuesta por Carlos')).toBeVisible();
  await pm.getByRole('button', { name: /^Aprobar CR-\d+$/ }).click();
  await pm.getByRole('dialog').getByLabel('Nota de la decisión').fill('De acuerdo');
  await pm.getByRole('dialog').getByRole('button', { name: 'Aprobar' }).click();
  await expect(pm.getByRole('dialog')).toHaveCount(0);
  await carlos.reload();
  await expect(carlos.getByRole('listitem').filter({ hasText: 'Agregar buscador' })).toContainText('Aprobada');

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

  // Horas: Carlos registra 2 h en su tarea.
  const hours = carlos.getByRole('region', { name: 'Horas' });
  await hours.getByLabel('Horas', { exact: true }).fill('2');
  await hours.getByRole('button', { name: 'Registrar horas' }).click();
  await expect(hours.getByText('2 h registradas')).toBeVisible();
  await carlos.getByLabel('Estado').selectOption({ label: 'En curso' });

  await carlos.getByRole('link', { name: 'Tareas del proyecto' }).click();
  await carlos.getByRole('link', { name: 'Diseño' }).click();
  const downloadPromise = carlos.waitForEvent('download');
  await carlos.getByRole('link', { name: 'diseño final.pdf' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('diseño final.pdf');

  // F3: el PM ve en Actividad que Beatriz terminó Diseño; Carlos no tiene la pestaña.
  await pm.goto(`${projectUrl}/actividad`);
  await expect(
    pm.getByRole('listitem', { name: 'Beatriz cambió la tarea «Diseño»' }).filter({ hasText: /Estado: .+ → Hecha/ }),
  ).toBeVisible();
  await expect(carlos.getByRole('navigation', { name: 'Secciones del proyecto' }).getByRole('link', { name: 'Actividad' })).toHaveCount(0);

  // Incidentes: Carlos reporta uno desde su tarea, el PM lo asigna, Carlos lo resuelve y el PM lo cierra con una decisión.
  await carlos.goto(`${projectUrl}/tareas`);
  await carlos.getByRole('main').getByRole('link', { name: 'Construcción' }).click();
  await carlos.getByRole('button', { name: 'Reportar incidente' }).click();
  await carlos.getByRole('dialog').getByLabel('Título').fill('Servidor de pruebas caído');
  await carlos.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(carlos.getByRole('region', { name: 'Incidentes de la tarea' }).getByText(/INC-1/)).toBeVisible();

  await pm.goto(`${projectUrl}/incidentes`);
  await pm.getByRole('button', { name: 'Ver INC-1' }).click();
  await pm.getByRole('dialog').getByRole('button', { name: 'Editar' }).click();
  const incidentDialog = pm.getByRole('dialog');
  await incidentDialog.getByLabel('Responsable').selectOption({ label: 'Carlos' });
  await incidentDialog.getByLabel('Prioridad').selectOption({ label: 'Alta' });
  await incidentDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(pm.getByRole('dialog')).toHaveCount(0);
  await expect(pm.getByRole('table').getByText('Carlos')).toBeVisible();

  await carlos.goto(`${projectUrl}/incidentes`);
  await carlos.getByRole('button', { name: 'Ver INC-1' }).click();
  await carlos.getByRole('dialog').getByRole('button', { name: 'Resolver' }).click();
  await carlos.getByRole('dialog').getByLabel('Resolución').fill('Se reinició el servidor');
  await carlos.getByRole('dialog').getByRole('button', { name: 'Resolver' }).click();
  await expect(carlos.getByRole('table').getByText('Resuelto')).toBeVisible();

  await pm.reload();
  await pm.getByRole('button', { name: 'Ver INC-1' }).click();
  await pm.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click();
  await pm.getByRole('dialog').getByLabel('Registrar como decisión').check();
  await pm.getByRole('dialog').getByRole('button', { name: 'Cerrar incidente' }).click();
  await expect(pm.getByRole('table').getByText('Cerrado')).toBeVisible();
  await pm.getByRole('link', { name: 'Control de cambios' }).click();
  await expect(pm.getByText('DEC-1')).toBeVisible();
  await expect(pm.getByText('Cierre de INC-1: Servidor de pruebas caído')).toBeVisible();

  // Entregables: el PM registra un interesado y sube el acta; luego rechaza el entregable y después lo acepta.
  await pm.getByRole('link', { name: 'Interesados' }).click();
  await pm.getByRole('button', { name: 'Añadir interesado' }).click();
  await pm.getByRole('dialog').getByLabel('Nombre').fill('Cliente SA');
  await pm.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(pm.getByRole('table').getByText('Cliente SA').first()).toBeVisible();
  await pm.getByRole('link', { name: 'Anexos' }).click();
  await pm.getByLabel('Adjuntar archivo').setInputFiles({ name: 'acta de aceptación.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-acta') });
  await expect(pm.getByRole('link', { name: 'acta de aceptación.pdf' })).toBeVisible();

  await pm.getByRole('link', { name: 'Entregables' }).click();
  await pm.getByRole('button', { name: 'Añadir entregable' }).click();
  const newDeliverable = pm.getByRole('dialog', { name: 'Añadir entregable' });
  await newDeliverable.getByLabel('Nombre').fill('Portal publicado');
  await newDeliverable.getByLabel('Criterio 1', { exact: true }).fill('Funciona en móvil');
  await newDeliverable.getByRole('button', { name: 'Añadir criterio' }).click();
  await newDeliverable.getByLabel('Criterio 2', { exact: true }).fill('Manual entregado');
  await newDeliverable.getByRole('button', { name: 'Guardar' }).click();
  await expect(pm.getByRole('table').getByText('ENT-1')).toBeVisible();

  await pm.getByRole('button', { name: 'Ver ENT-1' }).click();
  const deliverable = pm.getByRole('dialog', { name: 'ENT-1 · Portal publicado' });
  await deliverable.getByRole('button', { name: 'Enviar a revisión' }).click();
  await deliverable.getByRole('button', { name: 'Rechazar' }).click();
  const reject = pm.getByRole('dialog', { name: 'Rechazar ENT-1' });
  await reject.getByLabel('Nota').fill('Falta el manual');
  // Este rechazo no abre no conformidad: el flujo cierra el proyecto más adelante sin incidentes abiertos.
  await reject.getByRole('checkbox', { name: 'Registrar no conformidad' }).uncheck();
  await reject.getByRole('button', { name: 'Rechazar' }).click();
  await expect(deliverable.getByRole('region', { name: 'Revisiones' }).getByText('Falta el manual')).toBeVisible();

  await deliverable.getByRole('button', { name: 'Enviar a revisión' }).click();
  await deliverable.getByRole('checkbox', { name: 'Funciona en móvil' }).click();
  await expect(deliverable.getByRole('checkbox', { name: 'Funciona en móvil' })).toBeChecked();
  await deliverable.getByRole('checkbox', { name: 'Manual entregado' }).click();
  await expect(deliverable.getByRole('checkbox', { name: 'Manual entregado' })).toBeChecked();
  await deliverable.getByRole('button', { name: 'Aceptar' }).click();
  const accept = pm.getByRole('dialog', { name: 'Aceptar ENT-1' });
  await accept.getByLabel('Interesado').selectOption({ label: 'Cliente SA' });
  await accept.getByLabel('Anexo').selectOption({ label: 'acta de aceptación.pdf' });
  await accept.getByRole('button', { name: 'Aceptar' }).click();
  const history = deliverable.getByRole('region', { name: 'Revisiones' });
  await expect(history.getByText('Aceptado')).toBeVisible();
  await expect(history.getByText('Rechazado')).toBeVisible();
  await expect(history.getByRole('link', { name: 'acta de aceptación.pdf' })).toBeVisible();
  await deliverable.getByRole('button', { name: 'Cerrar' }).click();
  await expect(pm.getByRole('table').getByText('Aceptado')).toBeVisible();

  // Requisitos: el PM liga un requisito al entregable y lo ve en la matriz de trazabilidad.
  await pm.getByRole('navigation', { name: 'Secciones del proyecto' }).getByRole('link', { name: 'Requisitos' }).click();
  await pm.getByRole('button', { name: 'Añadir requisito' }).click();
  const newRequirement = pm.getByRole('dialog', { name: 'Añadir requisito' });
  await newRequirement.getByRole('textbox', { name: 'Descripción' }).fill('El sitio funciona en móvil');
  await newRequirement.getByRole('checkbox', { name: 'ENT-1 · Portal publicado' }).check();
  await newRequirement.getByRole('button', { name: 'Guardar' }).click();
  const traceability = pm.getByRole('region', { name: 'Matriz de trazabilidad' });
  await expect(traceability.getByText('REQ-1')).toBeVisible();
  await expect(traceability.getByText('ENT-1 · Portal publicado')).toBeVisible();

  // El cronograma resalta la ruta crítica.
  await pm.goto(`${projectUrl}/tareas?vista=cronograma`);
  await expect(pm.getByText('Ruta crítica')).toBeVisible();

  // 7. El PM ve el avance actualizado.
  await pm.goto(`${projectUrl}/resumen`);
  // Avance ponderado por costo: Diseño (1.000) al 100 % y Construcción (3.000) al 50 % dan 62,5 %.
  await expect(pm.getByTestId('indicator-progress')).toHaveText('63 %');

  // El panel refleja el proyecto.
  await pm.getByRole('link', { name: 'Inicio' }).click();
  await expect(pm.getByTestId('kpi-activeProjects')).toContainText('1');
  // Los cambios aprobados sin aplicar también enlazan a Portal desde «Requiere atención».
  await expect(pm.getByRole('main').getByRole('link', { name: 'Portal', exact: true })).toBeVisible();
  await expect(pm.getByRole('link', { name: /CR-1 · Agregar blog/ })).toBeVisible();

  // Cierre: el PM ve los pendientes y cierra con motivo; el proyecto queda en solo lectura.
  await pm.goto(`${projectUrl}/cierre`);
  const pendings = pm.getByRole('region', { name: 'Pendientes' });
  await expect(pendings.getByRole('link', { name: 'Tareas sin terminar' })).toBeVisible();
  await pendings.getByRole('button', { name: 'Cerrar proyecto' }).click();
  const closeDialog = pm.getByRole('dialog', { name: 'Cerrar proyecto' });
  await closeDialog.getByLabel('Motivo de los pendientes').fill('Se entrega en la fase 2');
  await closeDialog.getByRole('button', { name: 'Cerrar proyecto' }).click();
  await expect(pm.getByRole('status').filter({ hasText: 'solo lectura' })).toBeVisible();
  await expect(pm.getByRole('button', { name: 'Imprimir informe' })).toBeVisible();
  await pm.getByRole('link', { name: 'Tareas', exact: true }).click();
  await expect(pm.getByRole('button', { name: 'Nueva tarea' })).toHaveCount(0);

  // Con el proyecto cerrado, Carlos todavía registra una lección aprendida.
  await carlos.goto(`${projectUrl}/lecciones`);
  await carlos.getByRole('button', { name: 'Añadir lección' }).click();
  const lessonDialog = carlos.getByRole('dialog', { name: 'Añadir lección' });
  await lessonDialog.getByLabel('Tipo').selectOption({ label: 'A mejorar' });
  await lessonDialog.getByLabel('Situación').fill('Las pruebas empezaron tarde');
  await lessonDialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(carlos.getByRole('article').getByText('Las pruebas empezaron tarde')).toBeVisible();

  // El PM la encuentra en la página global y reabre el proyecto.
  await pm.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Lecciones' }).click();
  await pm.getByLabel('Buscar').fill('pruebas');
  await expect(pm.getByRole('article').getByText('Las pruebas empezaron tarde')).toBeVisible();
  await pm.getByRole('article').getByRole('link', { name: 'Portal' }).click();
  await pm.getByRole('status').getByRole('button', { name: 'Reabrir' }).click();
  const reopenDialog = pm.getByRole('dialog', { name: 'Reabrir proyecto' });
  await reopenDialog.getByLabel('Motivo').fill('Seguimos con la fase 2');
  await reopenDialog.getByRole('button', { name: 'Reabrir' }).click();
  await expect(pm.getByText(/solo lectura/)).toHaveCount(0);
  await pm.getByRole('link', { name: 'Tareas', exact: true }).click();
  await expect(pm.getByRole('button', { name: 'Nueva tarea' })).toBeVisible();

  // Perfil Observador: Olga consulta el proyecto sin poder cambiarlo.
  await pm.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Usuarios' }).click();
  await createUser(pm, 'Olga', 'olga@x.com', 'Observador');
  await pm.goto(`${projectUrl}/resumen`);
  await addMember(pm, 'Olga', 'Patrocinadora');

  // Informe de estado: el PM lo emite y queda congelado para el observador.
  await pm.getByRole('navigation', { name: 'Secciones del proyecto' }).getByRole('link', { name: 'Informes' }).click();
  await pm.getByRole('button', { name: 'Nuevo informe' }).click();
  await expect(pm.getByText('Vista previa')).toBeVisible();
  await pm.getByRole('textbox', { name: 'Comentario' }).fill('Avance según lo previsto');
  await pm.getByRole('button', { name: 'Emitir', exact: true }).click();
  await pm.getByRole('dialog', { name: 'Emitir informe' }).getByRole('button', { name: 'Emitir' }).click();
  await expect(pm.getByRole('heading', { name: 'Informe 1' })).toBeVisible();
  await expect(pm.getByRole('heading', { name: 'Presupuesto' })).toBeVisible();

  const olga = await signInFirstTime(browser, 'olga@x.com', 'Proyectos');
  const olgaNav = olga.getByRole('navigation', { name: 'Principal' });
  await expect(olgaNav.getByRole('link', { name: /Mis tareas/ })).toHaveCount(0);
  await olga.goto(`${projectUrl}/resumen`);
  await expect(olga.getByRole('heading', { level: 1, name: 'Portal' })).toBeVisible();
  await expect(olga.getByRole('button', { name: 'Nueva tarea' })).toHaveCount(0);
  const olgaTabs = olga.getByRole('navigation', { name: 'Secciones del proyecto' });
  await expect(olgaTabs.getByRole('link', { name: 'Entregables' })).toBeVisible();
  await expect(olgaTabs.getByRole('link', { name: 'Riesgos' })).toHaveCount(0);
  await olgaTabs.getByRole('link', { name: 'Lecciones' }).click();
  await expect(olga.getByRole('article').first()).toBeVisible();
  await expect(olga.getByRole('button', { name: 'Añadir lección' })).toHaveCount(0);
  await olgaTabs.getByRole('link', { name: 'Informes' }).click();
  await olga.getByRole('link', { name: 'Informe 1' }).click();
  await expect(olga.getByText('Avance según lo previsto')).toBeVisible();
  await expect(olga.getByRole('heading', { name: 'Desempeño' })).toBeVisible();
  await expect(olga.getByRole('heading', { name: 'Presupuesto' })).toHaveCount(0);
  await expect(olga.getByRole('button', { name: 'Nuevo informe' })).toHaveCount(0);
});
